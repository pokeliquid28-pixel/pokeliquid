"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function RefPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  useEffect(() => {
    if (username) {
      localStorage.setItem("pokeliquid_referrer", username);
    }
    router.replace("/");
  }, [username, router]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
        color: "#888",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 14,
      }}
    >
      Redirecting...
    </div>
  );
}
