import { createContext, useContext, useState, type ReactNode } from 'react'

const TransformToolbarContext = createContext<{ target: HTMLDivElement | null; setTarget: (target: HTMLDivElement | null) => void } | null>(null)

export function TransformToolbarProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  return <TransformToolbarContext.Provider value={{ target, setTarget }}>{children}</TransformToolbarContext.Provider>
}

export function TransformToolbarSlot() {
  const toolbar = useContext(TransformToolbarContext)
  return <div ref={toolbar?.setTarget} className="transform-toolbar-slot" />
}

export function useTransformToolbarTarget() {
  return useContext(TransformToolbarContext)?.target ?? null
}
