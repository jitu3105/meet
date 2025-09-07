import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

const NotFound = () => {
  const navigate = useNavigate();
  return (
    <>
      <Card>
        <CardContent>I thing You Are Lost</CardContent>
        <CardFooter>
          <Button
            onClick={() => {
              navigate("/");
            }}
          >
            Go To Home Page
          </Button>
        </CardFooter>
      </Card>
      <img src="/not-found.svg" />
    </>
  );
};

export default NotFound;
