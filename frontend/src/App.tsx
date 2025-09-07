import Home from "./pages/home";
import { Route, Routes } from "react-router-dom";
import NotFound from "./pages/not-found";
import Meet from "./pages/meet";
function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/:meetingId" element={<Meet />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default App;
