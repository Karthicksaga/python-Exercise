import { Component, type ReactNode } from "react";

// A map failure (quota, blocked key, offline) must never take the booking flow down with it.
export default class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="map-fallback" role="status">
        <strong>Map unavailable</strong>
        <p className="muted">You can still search for places and book — the map will return shortly.</p>
        <button type="button" className="ghost" onClick={() => this.setState({ failed: false })}>
          Retry map
        </button>
      </div>
    );
  }
}
