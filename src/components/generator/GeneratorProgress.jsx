import React from 'react';
import { Check } from 'lucide-react';

export default function GeneratorProgress({ steps, activeStep, motto }) {
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3 animate-bounce">🎲</div>
          <h2 className="text-lg font-bold font-heading">Playlist wird erstellt</h2>
          <p className="text-sm text-muted-foreground truncate">{motto}</p>
        </div>
        <div className="space-y-2.5">
          {steps.map((step, i) => {
            const isDone = i < activeStep;
            const isActive = i === activeStep;
            return (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                  isDone ? 'bg-success/5' : isActive ? 'bg-primary/10' : 'opacity-30'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  isDone ? 'bg-success/20' : isActive ? 'bg-primary/20' : 'bg-secondary'
                }`}>
                  {isDone ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : isActive ? (
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  ) : (
                    <span className="text-sm">{step.icon}</span>
                  )}
                </div>
                <p className={`text-sm font-medium flex-1 ${isDone ? 'text-success' : isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {isDone ? `✅ ${step.done}` : step.text}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}