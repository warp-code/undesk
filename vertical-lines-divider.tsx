export default function VerticalLinesDivider() {
  // Generate array of lines
  const lineCount = 200;
  const lines = Array.from({ length: lineCount }, (_, i) => i);

  return (
    <div className="w-full bg-neutral-950 py-16">
      <div className="w-full overflow-hidden">
        <div className="flex justify-center items-center gap-[3px]">
          {lines.map((i) => (
            <div
              key={i}
              className="w-[1px] h-12 bg-white/40"
              style={{
                opacity: 0.3 + Math.random() * 0.4
              }}
            />
          ))}
        </div>
      </div>
      
      {/* Alternative version with CSS only */}
      <div className="mt-16 text-center">
        <p className="text-white/50 text-sm mb-8">CSS-only version (more performant):</p>
        <div 
          className="w-full h-12 mx-auto"
          style={{
            backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.4) 0px, rgba(255,255,255,0.4) 1px, transparent 1px, transparent 4px)',
            backgroundSize: '4px 100%'
          }}
        />
      </div>
    </div>
  );
}
