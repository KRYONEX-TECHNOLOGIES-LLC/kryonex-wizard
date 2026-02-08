import React from "react";

const TIME_OPTIONS = [
  "06:00 AM", "07:00 AM", "08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM",
  "12:00 PM", "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM",
  "06:00 PM", "07:00 PM", "08:00 PM", "09:00 PM", "10:00 PM",
];

export default function TimeSelect({ value, onChange }) {
  const handleChange = (e) => {
    const newValue = e.target.value;
    // Support both patterns: onChange(value) and onChange(event)
    if (onChange) {
      onChange(newValue);
    }
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      className="bg-black/40 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:border-neon-cyan focus:outline-none transition-colors cursor-pointer hover:bg-white/5 min-w-[120px]"
      style={{ WebkitAppearance: "menulist", appearance: "menulist" }}
    >
      {TIME_OPTIONS.map((time) => (
        <option key={time} value={time}>{time}</option>
      ))}
    </select>
  );
}
