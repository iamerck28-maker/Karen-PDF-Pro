import { useState, useCallback, useRef } from 'react';

export function useHistory<T>(initialState: T) {
  const historyRef = useRef<T[]>([initialState]);
  const indexRef = useRef(0);
  const [, setRevision] = useState(0);

  const push = useCallback((newState: T) => {
    const history = historyRef.current;
    const index = indexRef.current;
    
    // Snip the history if we are pushing a new state after some undos
    const newHistory = history.slice(0, index + 1);
    newHistory.push(newState);
    
    historyRef.current = newHistory;
    indexRef.current = newHistory.length - 1;
    
    setRevision(r => r + 1);
  }, []);

  const undo = useCallback(() => {
    if (indexRef.current > 0) {
      indexRef.current -= 1;
      setRevision(r => r + 1);
      return historyRef.current[indexRef.current];
    }
    return null;
  }, []);

  const redo = useCallback(() => {
    if (indexRef.current < historyRef.current.length - 1) {
      indexRef.current += 1;
      setRevision(r => r + 1);
      return historyRef.current[indexRef.current];
    }
    return null;
  }, []);

  const clear = useCallback((state: T) => {
      historyRef.current = [state];
      indexRef.current = 0;
      setRevision(r => r + 1);
  }, []);

  return { 
    push, 
    undo, 
    redo, 
    clear, 
    get canUndo() { return indexRef.current > 0; }, 
    get canRedo() { return indexRef.current < historyRef.current.length - 1; }
  };
}
