import React from "react";
import { motion } from "framer-motion";

const scrambleChars = "▓▒░<>/\\{}[]()#@!$%&*";

export default function TerminalTyping({ text }) {
  const [display, setDisplay] = React.useState("");

  React.useEffect(() => {
    let frame = 0;
    const interval = setInterval(() => {
      frame += 1;
      const progress = Math.min(frame / 18, 1);
      const nextText = text
        .split("")
        .map((char, idx) => {
          if (idx < text.length * progress) return char;
          return scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
        })
        .join("");
      setDisplay(nextText);
      if (progress === 1) clearInterval(interval);
    }, 45);

    return () => clearInterval(interval);
  }, [text]);

  return (
    <motion.h1
      className="terminal-text mono"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
    >
      {display}
    </motion.h1>
  );
}
