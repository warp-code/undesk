import React, { useState, useEffect } from 'react';

const ROWS = 4;
const COLS = 24;
const ACTIVE_DURATION = 2000;

const generateRandomData = () => {
  return (Math.random() * 100).toFixed(2);
};

const StatusIndicator = () => {
  const statusDotStyle = {
    width: '6px',
    height: '6px',
    background: '#f97316',
    borderRadius: '50%',
    boxShadow: '0 0 8px #f97316',
    animation: 'pulse 2s infinite'
  };

  const statusIndicatorStyle = {
    position: 'absolute',
    top: '40px',
    left: '60px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#f97316',
    textTransform: 'uppercase',
    letterSpacing: '0.1em'
  };

  return (
    <div style={statusIndicatorStyle}>
      <div style={statusDotStyle}></div>
      System Operational
    </div>
  );
};

const Button = ({ children, onClick }) => {
  const buttonStyle = {
    background: '#f97316',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '0.5rem',
    fontSize: '0.9rem',
    fontWeight: '500',
    fontFamily: "'Inter', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    boxShadow: '0 0 20px rgba(249, 115, 22, 0.4)'
  };

  return (
    <button 
      style={buttonStyle}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 0 30px rgba(249, 115, 22, 0.6)';
        e.currentTarget.style.transform = 'translateX(2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 0 20px rgba(249, 115, 22, 0.4)';
        e.currentTarget.style.transform = 'translateX(0)';
      }}
    >
      {children}
    </button>
  );
};

const GridCol = ({ row, col, isActive, dataValue }) => {
  const colStyle = {
    flex: 1,
    borderRight: isActive ? '1px solid #f97316' : '1px solid rgba(255, 255, 255, 0.04)',
    position: 'relative',
    transition: 'background-color 0.6s ease, border-color 0.6s ease',
    background: isActive 
      ? 'linear-gradient(180deg, rgba(42, 246, 157, 0) 0%, rgba(42, 246, 157, 0.08) 100%)'
      : 'transparent',
    boxShadow: isActive ? '0 0 15px rgba(42, 246, 157, 0.05)' : 'none',
    zIndex: isActive ? 2 : 1
  };

  const afterStyle = isActive ? {
    content: '""',
    position: 'absolute',
    bottom: 0,
    left: '-1px',
    width: '1px',
    height: '100%',
    background: 'linear-gradient(to top, #f97316, transparent)',
    boxShadow: '0 0 8px #f97316'
  } : {};

  const labelStyle = {
    position: 'absolute',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    color: isActive ? '#f97316' : '#888888',
    opacity: isActive ? 1 : 0,
    pointerEvents: 'none',
    transition: 'opacity 0.3s',
    bottom: '10px',
    left: '6px'
  };

  return (
    <div style={colStyle}>
      {isActive && <div style={afterStyle}></div>}
      <div style={labelStyle}>{dataValue}</div>
    </div>
  );
};

const GridRow = ({ rowIndex, activeCols, dataValues }) => {
  const rowStyle = {
    flex: 1,
    display: 'flex',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
    position: 'relative'
  };

  return (
    <div style={rowStyle}>
      {Array.from({ length: COLS }).map((_, colIndex) => {
        const colKey = `${rowIndex}-${colIndex}`;
        return (
          <GridCol
            key={colKey}
            row={rowIndex}
            col={colIndex}
            isActive={activeCols.includes(colKey)}
            dataValue={dataValues[colKey] || generateRandomData()}
          />
        );
      })}
    </div>
  );
};

const GridPanel = () => {
  const [activeCols, setActiveCols] = useState([]);
  const [dataValues, setDataValues] = useState({});

  useEffect(() => {
    const animateGrid = () => {
      const totalCols = ROWS * COLS;
      const idx1 = Math.floor(Math.random() * totalCols);
      let idx2 = Math.floor(Math.random() * totalCols);
      
      while (idx1 === idx2) {
        idx2 = Math.floor(Math.random() * totalCols);
      }

      const row1 = Math.floor(idx1 / COLS);
      const col1 = idx1 % COLS;
      const row2 = Math.floor(idx2 / COLS);
      const col2 = idx2 % COLS;

      const key1 = `${row1}-${col1}`;
      const key2 = `${row2}-${col2}`;

      setActiveCols([key1, key2]);
      setDataValues({
        [key1]: generateRandomData(),
        [key2]: generateRandomData()
      });
    };

    animateGrid();
    const interval = setInterval(animateGrid, ACTIVE_DURATION);

    return () => clearInterval(interval);
  }, []);

  const panelStyle = {
    position: 'relative',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    maskImage: 'linear-gradient(to right, transparent 0%, black 15%)',
    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 15%)'
  };

  const glowStyle = {
    position: 'absolute',
    bottom: '-20%',
    right: '-10%',
    width: '600px',
    height: '600px',
    background: 'radial-gradient(circle, rgba(42, 246, 157, 0.08) 0%, transparent 70%)',
    filter: 'blur(80px)',
    pointerEvents: 'none',
    zIndex: 0
  };

  return (
    <div style={panelStyle}>
      <div style={glowStyle}></div>
      {Array.from({ length: ROWS }).map((_, rowIndex) => (
        <GridRow
          key={rowIndex}
          rowIndex={rowIndex}
          activeCols={activeCols}
          dataValues={dataValues}
        />
      ))}
    </div>
  );
};

const ContentPanel = () => {
  const panelStyle = {
    padding: '80px 60px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 10
  };

  const h1Style = {
    fontSize: '4rem',
    lineHeight: '0.95',
    letterSpacing: '-0.04em',
    fontWeight: '600',
    marginBottom: '24px',
    background: 'linear-gradient(180deg, #fff 0%, #aaa 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text'
  };

  const subtitleStyle = {
    fontSize: '1.1rem',
    color: '#888888',
    lineHeight: '1.5',
    maxWidth: '400px',
    marginBottom: '48px',
    fontWeight: '400'
  };

  const ctaGroupStyle = {
    display: 'flex',
    gap: '20px',
    alignItems: 'center'
  };

  const versionStyle = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#444444'
  };

  return (
    <div style={panelStyle}>
      <StatusIndicator />
      
      <h1 style={h1Style}>
        Private peer-to-peer<br />OTC trading
      </h1>
      
      <p style={subtitleStyle}>
        Execute large trades with complete privacy. No slippage, no front-running, no information leakage.
      </p>

      <div style={ctaGroupStyle}>
        <Button onClick={() => console.log('Start Trading clicked')}>
          Start Trading →
        </Button>
        <div style={versionStyle}>
          V.4.0.2 STABLE
        </div>
      </div>
    </div>
  );
};

const App = () => {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
      
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        -webkit-font-smoothing: antialiased;
      }

      body {
        background-color: #030303;
        color: #ffffff;
        font-family: 'Inter', sans-serif;
        overflow: hidden;
        height: 100vh;
        width: 100vw;
      }

      #root {
        height: 100%;
        width: 100%;
      }

      @keyframes pulse {
        0% { opacity: 0.5; }
        50% { opacity: 1; }
        100% { opacity: 0.5; }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const layoutStyle = {
    display: 'grid',
    gridTemplateColumns: '40% 60%',
    width: '100%',
    height: '100%'
  };

  return (
    <div style={layoutStyle}>
      <ContentPanel />
      <GridPanel />
    </div>
  );
};

export default App;