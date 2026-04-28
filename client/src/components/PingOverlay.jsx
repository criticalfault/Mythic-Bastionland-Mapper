import React from 'react';

export default function PingOverlay({ pings, getHexCenter }) {
  return (
    <>
      {pings.map(ping => {
        const center = getHexCenter(ping.q, ping.r);
        if (!center) return null;
        const color = ping.color || '#f59e0b';
        return (
          <g key={ping.id} className="ping-group">
            <circle
              cx={center.x}
              cy={center.y}
              r="8"
              fill="none"
              stroke={color}
              strokeWidth="2"
              className="ping-ring ping-ring-1"
            />
            <circle
              cx={center.x}
              cy={center.y}
              r="8"
              fill="none"
              stroke={color}
              strokeWidth="2"
              className="ping-ring ping-ring-2"
            />
            <circle
              cx={center.x}
              cy={center.y}
              r="4"
              fill={color}
              opacity="0.8"
              className="ping-dot"
            />
          </g>
        );
      })}
    </>
  );
}
