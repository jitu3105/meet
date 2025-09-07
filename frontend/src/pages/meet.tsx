import { useEffect } from "react";
import { useParams } from "react-router-dom";
import io from "socket.io-client";

const Meet = () => {
  const { meetingId } = useParams();
  useEffect(() => {
    if (!meetingId) return;
    io("http://localhost:3000", { extraHeaders: { meetingId } })
      .on("connect", () => {
        console.log("Connected to the server");
      })
      .on("disconnect", () => {
        console.log("Disconnected from the server");
      });
  }, [meetingId]);

  return <div></div>;
};

export default Meet;
