import React from 'react';

interface LogoProps {
  className?: string;
  color?: string; // Main text color
}

export const VelumLogo: React.FC<LogoProps> = ({ className = "h-12 w-auto", color = "currentColor" }) => {
  return (
    <svg 
      viewBox="0 -5 340 125" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
      aria-label="VELUM LASER Logo"
    >
      {/* V */}
      <path d="M10 20 L35 80 L60 20" stroke={color} strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter"/>
      
      {/* E (with Accent) */}
      <path d="M80 20 L80 80 L115 80" stroke={color} strokeWidth="3" strokeLinecap="square"/>
      <path d="M80 50 L110 50" stroke={color} strokeWidth="3" strokeLinecap="square"/>
      <path d="M80 20 L115 20" stroke={color} strokeWidth="3" strokeLinecap="square"/>
      {/* Accent on E */}
      <path d="M95 0 L115 15" stroke={color} strokeWidth="3" strokeLinecap="square"/>

      {/* L */}
      <path d="M135 20 L135 80 L170 80" stroke={color} strokeWidth="3" strokeLinecap="square"/>

      {/* U */}
      <path d="M190 20 L190 55 C190 75 200 80 220 80 C240 80 250 75 250 55 L250 20" stroke={color} strokeWidth="3" strokeLinecap="square"/>
      {/* Gold Dot inside U */}
      <circle cx="220" cy="45" r="5" fill="#d4af37" />

      {/* M */}
      <path d="M270 80 L270 20 L300 65 L330 20 L330 80" stroke={color} strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter"/>

      {/* LASER Subtext */}
      {/* Centered under U. U center is 220. LASER local center is ~110. 110*0.25=27.5. 220-27.5 = 192.5 */}
      <g transform="translate(192.5, 92) scale(0.25)">
         {/* L */}
         <path d="M10 0 L10 50 L40 50" stroke={color} strokeWidth="4" fill="none"/>
         {/* A */}
         <path d="M50 50 L65 0 L80 50 M55 35 L75 35" stroke={color} strokeWidth="4" fill="none"/>
         {/* S */}
         <path d="M120 10 C120 0 110 0 105 5 C100 10 90 25 110 30 C130 35 120 50 115 50 C110 50 100 50 95 40" stroke={color} strokeWidth="4" fill="none"/>
         {/* E */}
         <path d="M160 0 L140 0 L140 50 L160 50 M140 25 L155 25" stroke={color} strokeWidth="4" fill="none"/>
         {/* R */}
         <path d="M180 50 L180 0 L195 0 C205 0 205 20 195 25 L180 25 M195 25 L210 50" stroke={color} strokeWidth="4" fill="none"/>
      </g>
    </svg>
  );
};