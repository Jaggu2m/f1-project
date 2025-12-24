import TrackWithCar from "./TrackWithCar";

function App() {
  return (
    <div
      style={{
        padding: 20,
        backgroundColor: "#000",
        minHeight: "100vh",
      }}
    >
      <h2 style={{ color: "white", marginBottom: 10 }}>
        Monza – Single Car Replay (Phase 2)
      </h2>

      <TrackWithCar />
    </div>
  );
}

export default App;
