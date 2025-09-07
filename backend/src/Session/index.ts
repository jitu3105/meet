import { types as mediasoupTypes } from "mediasoup";
import * as mediasoup from "mediasoup";
import Logger from "../Logger";
export default class Session {
  worker!: mediasoupTypes.Worker;
  rtpParameters!: mediasoupTypes.RtpParameters;
  rtpCapabilities!: mediasoupTypes.RouterRtpCapabilities;
  logger = new Logger({ lable: "Session" });
  async init() {
    this.worker = await mediasoup.createWorker<{ foo: number }>({
      logLevel: "warn",
      //   dtlsCertificateFile: "/home/foo/dtls-cert.pem",
      //   dtlsPrivateKeyFile: "/home/foo/dtls-key.pem",
      //   appData: { foo: 123 },
    });
  }
  constructor() {
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
    this.rtpCapabilities = mediasoup.getSupportedRtpCapabilities();
    mediasoup.observer.on("newworker", (worker) => {
      this.logger.log("new worker created [pid:%d] -> " + worker.pid);
    });
  }
}
