import type { Consumer } from "mediasoup-client/types";
import React, { useEffect, useRef } from "react";
import { Card, CardContent } from "./ui/card";

const ClientWindows: React.FC<{ consumers: Consumer[] }> = ({ consumers }) => {
  return consumers.length > 0 ? (
    <Card className="w-full h-full rounded-none ">
      <CardContent
        className="
          w-full h-full
          grid gap-4
          place-items-center
        "
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}
      >
        {consumers.map((consumer) => (
          <Client consumer={consumer} />
        ))}
      </CardContent>
    </Card>
  ) : (
    <></>
  );
};

const Client: React.FC<{ consumer: Consumer }> = ({ consumer }) => {
  useEffect(() => {
    console.log("Consumer created", consumer);

    // Create a MediaStream for this consumer’s track
    const stream = new MediaStream();
    stream.addTrack(consumer.track);
    const kind = consumer.track.kind;
    // // Attach to an element
    let el: HTMLVideoElement | HTMLAudioElement;

    if (kind == "video") {
      el = videoref.current!;
      el.controls = false;
      el.srcObject = stream;
      el.autoplay = true;
    }
    if (kind == "audio") {
      el = audioref.current!;
      el.srcObject = stream;
      el.autoplay = true;
    }
    // el.playsInline = true; // required for iOS safari

    // // For video, you might want controls

    // document.body.appendChild(el);

    // // Optional: monitor consumer state
    consumer.on("transportclose", () => {
      console.log("Consumer transport closed, consumer removed");
      consumer.close();
      el.remove();
    });
  }, [consumer]);
  const videoref = useRef<HTMLVideoElement>(null);
  const audioref = useRef<HTMLAudioElement>(null);
  return consumer.track.kind == "audio" ? (
    <audio ref={audioref} />
  ) : (
    <Card className="w-full h-full  min-w-28 p-0 aspect-video">
      <video
        ref={videoref}
        className="w-full h-full object-contain aspect-video"
      />
    </Card>
  );
};

export default ClientWindows;
