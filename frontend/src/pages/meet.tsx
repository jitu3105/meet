import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import io, { Socket } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";
import type {
  Consumer,
  Producer,
  TransportOptions,
} from "mediasoup-client/types";

import { Card, CardContent } from "@/components/ui/card";
import ClientWindows from "@/components/client-windows";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, Mic, MicOff } from "lucide-react";

const Meet = () => {
  const { meetingId } = useParams();

  /* ---------------- REFS ---------------- */

  const deviceRef = useRef<mediasoupClient.Device>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const bitrateRef = useRef<HTMLParagraphElement>(null);

  /* ---------------- STATE ---------------- */

  const [socket, setSocket] = useState<Socket | null>(null);
  const [sendTransport, setSendTransport] =
    useState<mediasoupClient.types.Transport>();
  const [recvTransport, setRecvTransport] =
    useState<mediasoupClient.types.Transport>();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [audioProducer, setAudioProducer] = useState<Producer>();
  const [videoProducer, setVideoProducer] = useState<Producer>();

  const [mute, setMute] = useState(false);
  const [video, setVideo] = useState(true);

  /* -------------------------------------------------- */
  /* MEDIA FIRST (CRITICAL)                             */
  /* -------------------------------------------------- */

  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true },
          video: true,
        });

        setLocalStream(stream);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.error("Permission denied", err);
      }
    })();
  }, []);

  /* -------------------------------------------------- */
  /* SOCKET CONNECT                                     */
  /* -------------------------------------------------- */

  useEffect(() => {
    if (!meetingId || !localStream) return;

    const skt = io("/api/meet", {
      path: "/ws/meet",
      extraHeaders: { meetingId },
    });

    skt.on("connect", () => {
      console.log("Connected");
      setSocket(skt);
    });

    skt.on("disconnect", () => {
      setSocket(null);
    });

    return () => {
      skt.close();
    };
  }, [meetingId, localStream]);

  /* -------------------------------------------------- */
  /* SIGNALING + DEVICE                                 */
  /* -------------------------------------------------- */

  useEffect(() => {
    if (!socket) return;

    socket.emit("join");

    socket.on("metadata", ({ bitrate }) => {
      if (bitrateRef.current) bitrateRef.current.innerHTML = bitrate;
    });

    socket.on(
      "rtpCaps",
      async (rtpCapabilities: mediasoupClient.types.RtpCapabilities) => {
        try {
          /* ---- DEVICE ---- */
          const device = new mediasoupClient.Device();
          await device.load({ routerRtpCapabilities: rtpCapabilities });

          deviceRef.current = device;

          /* ---- TRANSPORTS ---- */

          socket.emit(
            "getTransports",
            ({
              sendTransportOptions,
              recvTransportOptions,
              members = [],
            }: {
              sendTransportOptions: TransportOptions;
              recvTransportOptions: TransportOptions;
              members: { producerId: string; kind: string }[];
            }) => {
              const send = device.createSendTransport(sendTransportOptions);

              const recv = device.createRecvTransport(recvTransportOptions);

              setSendTransport(send);
              setRecvTransport(recv);
              /* consume existing members */

              members.forEach(({ producerId, kind }) => {
                consume(producerId, kind, recv);
              });
            },
          );
        } catch (err) {
          console.error("Device load failed", err);
        }
      },
    );

    socket.on("producersClosed", (ids: string[]) => {
      setConsumers((prev) => prev.filter((c) => !ids.includes(c.producerId)));
    });

    return () => {
      socket.off("rtpCaps");
      socket.off("metadata");
      socket.off("producersClosed");
    };
  }, [socket]);

  /* -------------------------------------------------- */
  /* SEND TRANSPORT                                     */
  /* -------------------------------------------------- */

  useEffect(() => {
    if (!sendTransport || !socket || !localStream) return;
    sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
      socket.emit("connectSendTransport", { dtlsParameters }, (err?: any) =>
        err ? errback?.(err) : callback(),
      );
    });

    sendTransport.on(
      "produce",
      ({ kind, rtpParameters }, callback, errback) => {
        socket.emit(
          "produce",
          { kind, rtpParameters },
          (producerId: string, err?: any) => {
            if (err) return errback?.(err);
            callback({ id: producerId });
          },
        );
      },
    );

    /* WAIT UNTIL CONNECTED */

    (async () => {
      const audioTrack = localStream.getAudioTracks()[0];
      const videoTrack = localStream.getVideoTracks()[0];

      const ap = await sendTransport.produce({ track: audioTrack });
      const vp = await sendTransport.produce({ track: videoTrack });

      setAudioProducer(ap);
      setVideoProducer(vp);

      ap.on("@pause", () => {
        alert("pause");
        setMute(true);
      });
      ap.on("@resume", () => setMute(false));

      vp.on("@pause", () => setVideo(false));
      vp.on("@resume", () => setVideo(true));
    })();
  }, [sendTransport, socket, localStream]);

  /* -------------------------------------------------- */
  /* RECEIVE TRANSPORT                                  */
  /* -------------------------------------------------- */

  useEffect(() => {
    if (!recvTransport || !socket) return;

    recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
      socket.emit("connectRecvTransport", { dtlsParameters }, (err?: any) =>
        err ? errback?.(err) : callback(),
      );
    });

    socket.on("newUser", ({ producerId, kind }) => {
      consume(producerId, kind, recvTransport);
    });

    return () => {
      socket.off("newUser");
    };
  }, [recvTransport, socket]);

  /* -------------------------------------------------- */
  /* CONSUME HELPER                                     */
  /* -------------------------------------------------- */

  const consume = async (
    producerId: string,
    kind: string,
    transport: mediasoupClient.types.Transport,
  ) => {
    if (!socket || !deviceRef.current) return;

    socket.emit(
      "consume",
      {
        producerId,
        kind,
        rtpCapabilities: deviceRef.current.rtpCapabilities,
      },
      async (data: any) => {
        if (!data || data.error) return;

        const consumer = await transport.consume(data);

        await consumer.resume?.();

        setConsumers((prev) => {
          if (prev.find((c) => c.id === consumer.id)) return prev;
          return [...prev, consumer];
        });
      },
    );
  };

  /* -------------------------------------------------- */
  /* UI                                                 */
  /* -------------------------------------------------- */

  return (
    <>
      <Card
        className={`absolute portrait:aspect-square portrait:w-6/12 w-2/12 min-w-64 landscape:aspect-video p-0 overflow-hidden bottom-4 left-4`}
        draggable={true}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        <Card className="absolute top-2 left-2 opacity-50 w-max">
          <CardContent className="flex">
            bitrate: <p ref={bitrateRef}></p>
          </CardContent>
        </Card>

        <Card className="absolute bottom-0 left-0 bg-transparent border-none shadow-none">
          <CardContent className="flex gap-4">
            <Button
              variant={mute ? "destructive" : "default"}
              onClick={() => {
                if (!audioProducer) return;

                if (mute) {
                  audioProducer.resume();
                  setMute(false);
                } else {
                  audioProducer.pause();
                  setMute(true);
                }
              }}
            >
              {mute ? <MicOff /> : <Mic />}
            </Button>

            <Button
              onClick={() => {
                if (!videoProducer) return;

                if (video) {
                  videoProducer.pause();
                  setVideo(false);
                } else {
                  videoProducer.resume();
                  setVideo(true);
                }
              }}
            >
              {video ? <Camera /> : <CameraOff />}
            </Button>
          </CardContent>
        </Card>
      </Card>
      <ClientWindows consumers={consumers} />
    </>
  );
};

export default Meet;
