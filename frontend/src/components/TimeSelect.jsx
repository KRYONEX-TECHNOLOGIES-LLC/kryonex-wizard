import React from "react";

export default function TimeSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:border-neon-cyan focus:outline-none transition-colors cursor-pointer hover:bg-white/5"
    >
      <option>06:00 AM</option>
      <option>07:00 AM</option>
      <option>08:00 AM</option>
      <option>09:00 AM</option>
      <option>10:00 AM</option>
      <option>11:00 AM</option>
      <option>12:00 PM</option>
      <option>01:00 PM</option>
      <option>02:00 PM</option>
      <option>03:00 PM</option>
      <option>04:00 PM</option>
      <option>05:00 PM</option>
      <option>06:00 PM</option>
      <option>07:00 PM</option>
      <option>08:00 PM</option>
    </select>
  );
}
