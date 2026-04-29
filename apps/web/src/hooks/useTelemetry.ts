import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** Generate or reuse an anonymous session identifier scoped to the browser tab. */
function getAnonSessionId(): string {
  const key = 'am_telemetry_sid';
  let sid = sessionStorage.getItem(key);
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem(key, sid);
  }
  return sid;
}

/**
 * Records a pageview to the telemetry endpoint on every route change.
 * Fire-and-forget — errors are intentionally swallowed.
 */
export function useTelemetry(): void {
  const { pathname } = useLocation();
  const sessionId = useRef(getAnonSessionId());

  useEffect(() => {
    fetch('/api/v1/telemetry/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname, sessionId: sessionId.current }),
    }).catch(() => { /* intentionally silent */ });
  }, [pathname]);
}
