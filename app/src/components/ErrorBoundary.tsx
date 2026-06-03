"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; fallbackMessage?: string };
type State = { hasError: boolean; error: string | null };

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "32px 16px",
            textAlign: "center",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <div style={{ fontSize: 12, color: "#ff3333", marginBottom: 12 }}>
            {this.props.fallbackMessage || "Something went wrong"}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              fontSize: 11,
              color: "#ccc",
              background: "none",
              border: "1px solid #333",
              padding: "6px 16px",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
