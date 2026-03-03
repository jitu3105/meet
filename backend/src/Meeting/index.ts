import { types as mediasoupTypes } from "mediasoup";
import * as mediasoup from "mediasoup";
import Logger from "../Logger";
import { Socket } from "socket.io";
import { RtpCodecCapability } from "mediasoup/node/lib/rtpParametersTypes";
import { WebRtcTransport } from "mediasoup/node/lib/WebRtcTransportTypes";
import { transport } from "winston";
import { clearInterval } from "timers";
export default class Meeting {
  private worker!: mediasoupTypes.Worker;
  private rtpParameters!: mediasoupTypes.RtpParameters;
  private rtpCapabilities!: mediasoupTypes.RouterRtpCapabilities;
  private router!: mediasoupTypes.Router;
  private logger = new Logger({ lable: "Session" });
  private users = new Map();
  private producers = new Map<string, mediasoupTypes.Producer>();
  private webRtcServer!: mediasoupTypes.WebRtcServer;
  private transports = new Map<
    string,
    { transport: WebRtcTransport; connected: boolean }
  >();
  private admin: Socket;
  sanitizeCodecs(rtpCaps: mediasoupTypes.RouterRtpCapabilities) {
    return rtpCaps.codecs!.map(({ preferredPayloadType, ...rest }) => rest);
  }

  // Strip Router-specific fields and cast safely
  toRtpCodec(
    codec: mediasoupTypes.RouterRtpCodecCapability
  ): RtpCodecCapability {
    const { preferredPayloadType, ...rest } = codec;

    // Drop preferredPayloadType → let mediasoup assign it dynamically
    return { ...rest } as RtpCodecCapability;
  }

  buildMediaCodecsFromSupported(
    supported: mediasoupTypes.RouterRtpCapabilities
  ): RtpCodecCapability[] {
    const codecs = supported.codecs!;

    const chosen: RtpCodecCapability[] = [];

    const opus = codecs.find(
      (c) => c.kind === "audio" && c.mimeType.toLowerCase() === "audio/opus"
    );
    if (opus) chosen.push(this.toRtpCodec(opus));

    const dtmf = codecs.find(
      (c) =>
        c.kind === "audio" &&
        c.mimeType.toLowerCase() === "audio/telephone-event"
    );
    if (dtmf) chosen.push(this.toRtpCodec(dtmf));

    const vp8 = codecs.find(
      (c) => c.kind === "video" && c.mimeType.toLowerCase() === "video/vp8"
    );
    if (vp8) chosen.push(this.toRtpCodec(vp8));

    const h264s = codecs.filter(
      (c) => c.kind === "video" && c.mimeType.toLowerCase() === "video/h264"
    );
    const h264 =
      h264s.find(
        (c) => Number((c.parameters as any)?.["packetization-mode"]) === 1
      ) || h264s[0];
    if (h264) chosen.push(this.toRtpCodec(h264));

    return chosen;
  }

  async init() {
    this.worker = await mediasoup.createWorker<{ foo: number }>({
      logLevel: "warn",
      rtcMinPort: 40000,
      rtcMaxPort: 40100,

      //   dtlsCertificateFile: "/home/foo/dtls-cert.pem",
      //   dtlsPrivateKeyFile: "/home/foo/dtls-key.pem",
      //   appData: { foo: 123 },
    });
    const supported = mediasoup.getSupportedRtpCapabilities();
    const mediaCodecs = this.buildMediaCodecsFromSupported(supported);
    this.router = await this.worker.createRouter({ mediaCodecs });
  }

  constructor({ admin }: { admin: Socket }) {
    this.admin = admin;
    this.rtpCapabilities = mediasoup.getSupportedRtpCapabilities();
    mediasoup.setLogEventListeners({
      ondebug: undefined,
      onwarn: (namespace, log) => this.logger.warn(`${namespace} ${log}`),
      onerror: (namespace, log, error) => {
        if (error) {
          this.logger.error(`${namespace} ${log}: ${error}`);
        } else {
          this.logger.error(`${namespace} ${log}`);
        }
      },
    });
    mediasoup.observer.on("newworker", (worker) => {
      this.logger.log("new worker created [pid:%d] -> " + worker.pid);
    });
  }

  private getRouterRtpCapabilities() {
    return this.router.rtpCapabilities;
  }

  private createWebRTCTransport = async () => {
    return this.router.createWebRtcTransport({
      listenIps: [{ ip: "0.0.0.0", announcedIp: "31.97.226.209" }],
      enableUdp: true,
      enableTcp: false,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
    });
  };
  joinUser(socket: Socket) {
    const rtpCapabilities = this.getRouterRtpCapabilities();
    socket.emit("rtpCaps", rtpCapabilities);
  }

  async getTransports(socket: Socket) {
    let sendResp = this.transports.get(socket.id + "_send");
    if (!sendResp) {
      const transport = await this.createWebRTCTransport();
      const userdata = this.users.get(socket.id);
      let data = {};
      if (userdata) {
        data = { ...data };
      }
      this.users.set(socket.id, {
        ...data,
        transport,
      });
      this.transports.set(socket.id + "_send", { transport, connected: false });
      this.logger.log("Send Transport created");
      sendResp = this.transports.get(socket.id + "_send");
    } else {
      this.logger.log("sendTransport already exists for this socket");
    }
    const sendTransport = sendResp!.transport;
    // if(!sendResp.connected) await sendTransport.connect({})

    let recvResp = this.transports.get(socket.id + "_recv");
    if (!recvResp) {
      const transport = await this.createWebRTCTransport();
      this.transports.set(socket.id + "_recv", { transport, connected: false });
      this.logger.log("Recv Transport created");
      recvResp = this.transports.get(socket.id + "_recv");
    } else {
      this.logger.log("recvTransport already exists for this socket");
    }
    const recvTransport = recvResp!.transport;
    const members: { producerId: string; kind: "video" | "audio" }[] = [];
    this.producers.forEach((producer, key) => {
      if (!key.includes(socket.id)) {
        members.push({ producerId: producer.id, kind: producer.kind });
      }
    });

    return {
      sendTransportOptions: {
        id: sendTransport.id,
        iceParameters: sendTransport.iceParameters,
        iceCandidates: sendTransport.iceCandidates,
        dtlsParameters: sendTransport.dtlsParameters,
      },
      recvTransportOptions: {
        id: recvTransport.id,
        iceParameters: recvTransport.iceParameters,
        iceCandidates: recvTransport.iceCandidates,
        dtlsParameters: recvTransport.dtlsParameters,
      },
      members,
    };
  }

  async connectSendTransport(
    socket: Socket,
    dtlsParameters: mediasoupTypes.DtlsParameters
  ) {
    let sendResp = this.transports.get(socket.id + "_send");
    if (sendResp?.connected) {
      this.logger.log("sendTransport already connected for this socket");
    } else {
      await sendResp?.transport.connect({ dtlsParameters });
      sendResp!.connected = true;
      this.logger.log("Send Transport connected");
    }
  }
  async connectRecvTransport(
    socket: Socket,
    dtlsParameters: mediasoupTypes.DtlsParameters
  ) {
    let recvResp = this.transports.get(socket.id + "_recv");
    if (recvResp?.connected) {
      this.logger.log("sendTransport already connected for this socket");
    } else {
      await recvResp?.transport.connect({ dtlsParameters });
      recvResp!.connected = true;
      this.logger.log("Send Transport connected");
    }
  }

  async produce(
    socket: Socket,
    kind: "audio" | "video",
    rtpParameters: mediasoupTypes.RtpParameters
  ) {
    let sendResp = this.transports.get(socket.id + "_send");
    const sendTransport = sendResp!.transport;
    const producer = await sendTransport.produce({
      kind,
      rtpParameters,
    });
    const interval = setInterval(async () => {
      const stats = await producer.getStats();
      stats.forEach((stat) => {
        if (stat.type === "inbound-rtp") {
          socket.emit("metadata", { bitrate: stat.bitrate });
          // console.log("Packets sent:", stat.packetsSent);
        }
      });
    }, 1000);
    const userdata = this.users.get(socket.id);
    let data = {};
    if (userdata) {
      data = { ...data };
    }
    if (kind == "audio") {
      this.users.set(socket.id, {
        ...data,
        audioProducer: producer,
        metadataInterval: interval,
      });
    }
    if (kind == "video") {
      this.users.set(socket.id, {
        ...data,
        videoProducer: producer,
        metadataInterval: interval,
      });
    }

    this.producers.set(
      producer.id + " __ " + socket.id + "__" + kind,
      producer
    );
    // socket.to(socket.data.roomId).emit("newProducer", {
    //   producerId: producer.id,
    //   kind: producer.kind,
    // });

    // Optional: listen for when the producer closes
    producer.on("transportclose", () => {
      console.log("Producer transport closed, closing producer");
      producer.close();
    });
    this.logger.log(`Producer for ${kind} created [id:${producer.id}]`);
    return producer.id;
  }
  cleanUserData(id: string) {
    const userData = this.users.get(id);
    if (!userData) return;
    let producers = [];
    if (userData.audioProducer) {
      producers.push(userData.audioProducer.id);
      this.transports.delete(userData.audioProducer.id);
    }
    if (userData.videoProducer) {
      producers.push(userData.videoProducer.id);
      this.transports.delete(userData.videoProducer.id);
    }
    if (userData.transport) {
      const sendTransport = this.transports.get(id + "_send");
      sendTransport?.transport.close();
      const recvTransport = this.transports.get(id + "_recv");
      recvTransport?.transport.close();
      this.transports.delete(id + "_send");
      this.transports.delete(id + "_recv");
    }
    if (userData.metadataInterval) {
      clearInterval(userData.metadataInterval);
    }
    this.users.delete(id);
    this.logger.log("cleared data for " + id);
    this.producers.forEach((producer, key) => {
      if (producers.includes(producer.id)) {
        producer.close();
        this.producers.delete(key);
      }
    });
    return producers;
  }

  async consume(
    socket: Socket,
    producerId: string,
    rtpCapabilities: mediasoupTypes.RtpCapabilities
  ) {
    if (!this.router.canConsume({ producerId, rtpCapabilities })) {
      this.logger.error("can not consume");
      return;
    }
    let recvResp = this.transports.get(socket.id + "_recv");
    if (!recvResp) {
      this.logger.error("no recv transport for this producer");
      return;
    }
    const recvTransport = recvResp.transport;
    const consumer = await recvTransport.consume({
      producerId,
      rtpCapabilities,
    });
    return {
      id: consumer.id,
      producerId,
      rtpParameters: consumer.rtpParameters,
    };
  }
}
