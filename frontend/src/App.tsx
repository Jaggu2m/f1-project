import ReplayController from "./replay/ReplayController";

function App() {
  return (
    <div
      style={{
        background: "#000",
        minHeight: "100vh",
        padding: 20,
      }}
    >
      <h2 style={{ color: "white", marginBottom: 12 }}>
        Monza 2023 – Race Replay (Phase 4)
      </h2>

      <ReplayController />
    </div>
  );
}

export default App;
