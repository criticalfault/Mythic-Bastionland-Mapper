import React from 'react';

export default function PingOverlay({ pings, getHexCenter }) {
  return (
    <>
      {pings.map(ping => {
        const center = getHexCenter(ping.q, ping.r);
        if (!center) return null;
        return (
          <g key={ping.id} className="ping-group">
            <circle
              cx={center.x}
              cy={center.y}
              r="8"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              className="ping-ring ping-ring-1"
            />
            <circle
              cx={center.x}
              cy={center.y}
              r="8"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              className="ping-ring ping-ring-2"
            />
            <circle
              cx={center.x}
              cy={center.y}
              r="4"
              fill="#f59e0b"
              opacity="0.8"
              className="ping-dot"
            />
          </g>
        );
      })}
    </>
  );
}
