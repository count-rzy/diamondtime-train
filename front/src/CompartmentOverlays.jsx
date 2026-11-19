import { createContext, useContext } from 'react'

export const CompartmentOverlayContext = createContext(null)
export const useCompartmentOverlays = () => useContext(CompartmentOverlayContext)
