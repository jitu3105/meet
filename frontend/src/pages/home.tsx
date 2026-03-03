import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Send } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuid } from "uuid";
const Home = () => {
  const navigate = useNavigate();
  const [meetingId, setMeetingId] = useState("");
  return (
    <Card className="h-full w-full bg-transparent border-0 shadow-none ">
      <CardContent className="flex flex-col h-full justify-around items-center ">
        <img src="/meet.svg" className="w-full h-2/5 object-contain" />
        <Card className="flex:1 w-full md:w-2/3 lg:w-4/12 h-fit">
          <CardHeader className="w-full ">
            <h1 className="text-2xl font-bold text-center">Welcome to MEET.</h1>
            <p className="text-center">
              this a video meeting platform. <br />
              created on a powerfull c++ based SFU MEDIASOUP
            </p>
          </CardHeader>
          <CardContent className="flex flex-col justify-around h-full gap-8">
            <Card className="flex p-0 gap-0 flex-row rounded-full overflow-hidden ">
              <Input
                placeholder="Enter Meeting Code "
                className="rounded-full rounded-r-none"
                value={meetingId}
                onChange={(e) => {
                  setMeetingId(e.target.value);
                }}
              />
              <Button
                className="rounded-none"
                onClick={() => {
                  navigate(`/${meetingId}`);
                }}
              >
                <Send />
              </Button>
            </Card>
            <Button
              className="rounded-full"
              variant={"link"}
              onClick={() => {
                navigate(`/${uuid()}`);
              }}
            >
              <Plus /> Start an Instant Meeting
            </Button>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
};

export default Home;
