import { forwardRef, useEffect, useRef, type InputHTMLAttributes } from 'react'
import './checkbox.css'

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { indeterminate?: boolean }

/** Native checkbox semantics with shared compact sizing and theme states. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ className = '', indeterminate = false, ...props }, ref) {
  const input = useRef<HTMLInputElement | null>(null)
  useEffect(() => { if (input.current) input.current.indeterminate = indeterminate }, [indeterminate])
  return <input {...props} type="checkbox" className={`app-checkbox ${className}`.trim()} ref={element => {
    input.current = element
    if (typeof ref === 'function') ref(element)
    else if (ref) ref.current = element
  }} />
})
