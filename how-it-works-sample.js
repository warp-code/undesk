import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

const ArchitecturalGrid = () => {
  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        backgroundImage: 'linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
        backgroundSize: '4rem 100%'
      }}
    />
  );
};

const SignalBar = ({ delay = 0, className = '' }) => {
  return (
    <div 
      className={`w-[3px] h-6 bg-orange-500 transition-all duration-300 group-hover:h-8 group-hover:bg-orange-400 ${className}`}
      style={{
        boxShadow: '0 0 10px 1px rgba(249, 115, 22, 0.3)',
        transitionDelay: delay > 0 ? `${delay}ms` : '0ms'
      }}
    />
  );
};

const StepCard = ({ title, description, barCount = 1 }) => {
  return (
    <div className="flex gap-8 group">
      <div className="flex gap-1.5 pt-2 h-full shrink-0">
        {[...Array(barCount)].map((_, index) => (
          <SignalBar 
            key={index} 
            delay={index * 75}
          />
        ))}
      </div>
      <div className="pt-0.5">
        <h3 className="text-lg font-semibold text-white mb-3 group-hover:text-orange-500 transition-colors duration-300">
          {title}
        </h3>
        <p className="text-gray-500 leading-relaxed text-[15px] max-w-lg">
          {description}
        </p>
      </div>
    </div>
  );
};

const HowItWorksPage = () => {
  const dealCreatorSteps = [
    {
      title: 'Post your deal',
      description: 'Define your trade: assets, size, and your price. Deposit funds. Everything is encrypted before it leaves your wallet.',
      barCount: 1
    },
    {
      title: 'Receive blind offers',
      description: "Counterparties submit offers without seeing your price or size. Offers that don't meet your threshold are rejected without information leaks.",
      barCount: 2
    },
    {
      title: 'Execute the deal',
      description: 'Once enough valid offers arrive, the trade is executed. Settlement is on-chain and private. You always get your price or better.',
      barCount: 3
    }
  ];

  const offerorSteps = [
    {
      title: 'Browse open deals',
      description: "See available deals and their assets. You won't see price or size, only what you need to decide if you're interested.",
      barCount: 1
    },
    {
      title: 'Submit your offer',
      description: "Make a blind offer with your desired price and size. If your offer passes the creator's threshold, it gets silently added to the deal.",
      barCount: 2
    },
    {
      title: 'Get matched',
      description: "If the deal executes and your offer matches, you receive exactly your desired price or better. If it doesn't, your funds are returned.",
      barCount: 3
    }
  ];

  return (
    <div className="antialiased min-h-screen flex flex-col" style={{ backgroundColor: '#0c0d10', color: '#e5e7eb', fontFamily: "'Inter', sans-serif" }}>
      <ArchitecturalGrid />
      
      <main className="flex-grow w-full max-w-[1440px] mx-auto px-8 md:px-12 py-24 lg:py-32" style={{ position: 'relative', zIndex: 10 }}>
        <div className="max-w-3xl mb-24 pl-2">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
            How It Works
          </h1>
          <p className="text-xl text-gray-500 font-medium">
            Posting, matching, and settlement — everything is encrypted.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-32 gap-y-20">
          <div className="space-y-20">
            <h2 className="text-2xl font-bold text-white pl-2">For Deal Creators</h2>
            {dealCreatorSteps.map((step, index) => (
              <StepCard
                key={index}
                title={step.title}
                description={step.description}
                barCount={step.barCount}
              />
            ))}
          </div>

          <div className="space-y-20">
            <h2 className="text-2xl font-bold text-white pl-2">For Offerors (Makers)</h2>
            {offerorSteps.map((step, index) => (
              <StepCard
                key={index}
                title={step.title}
                description={step.description}
                barCount={step.barCount}
              />
            ))}
          </div>
        </div>
      </main>

      <div className="h-32 w-full" />
    </div>
  );
};

const App = () => {
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    const style = document.createElement('style');
    style.textContent = `
      body {
        margin: 0;
        padding: 0;
        overflow-x: hidden;
      }
      ::selection {
        background: rgba(249, 115, 22, 0.2);
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(link);
      document.head.removeChild(style);
    };
  }, []);

  return (
    <Router basename="/">
      <Routes>
        <Route path="/" element={<HowItWorksPage />} />
      </Routes>
    </Router>
  );
};

export default App;