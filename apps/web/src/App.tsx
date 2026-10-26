import { useEffect, useState } from "react";

export function App() {
  const [health, setHealth] = useState("checking…");

  useEffect(() => {
    fetch("/api/health")
      .then(async (res) => `${String(res.status)} ${await res.text()}`)
      .catch((err: unknown) => String(err))
      .then(setHealth, () => undefined);
  }, []);

  return (
    <main>
      <h1>MMR Groups</h1>
      <p>API health: {health}</p>
    </main>
  );
}
