import { AppShell } from './AppShell'
import { DocumentWorkspaceProvider } from '../document/DocumentWorkspaceProvider'
import '../styles/theme.css'

export function App() { return <DocumentWorkspaceProvider><AppShell /></DocumentWorkspaceProvider> }
