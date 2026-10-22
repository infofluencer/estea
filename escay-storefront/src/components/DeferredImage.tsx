"use client"

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type SyntheticEvent,
} from "react"
import styles from "./DeferredImage.module.css"

const SPINNER_DELAY_MS = 250
export const VIEWPORT_REFRESH_EVENT = "escay:viewport-refresh"

export function refreshViewportDetection() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event("scroll"))
  window.dispatchEvent(new CustomEvent(VIEWPORT_REFRESH_EVENT))
}

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  spinnerDelayMs?: number
  showSpinner?: boolean
  fadeIn?: boolean
}

export function DeferredImage({
  className = "",
  spinnerDelayMs = SPINNER_DELAY_MS,
  showSpinner = true,
  fadeIn = true,
  onLoad,
  onError,
  src,
  alt = "",
  loading,
  ...rest
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading")
  const [spin, setSpin] = useState(false)

  useLayoutEffect(() => {
    const img = imgRef.current
    if (!src) {
      setState("loading")
      return
    }
    if (img?.complete) {
      setState(img.naturalWidth > 0 ? "loaded" : img.src ? "error" : "loading")
      return
    }
    setState("loading")
  }, [src])

  useEffect(() => {
    if (state !== "loading" || !showSpinner) {
      setSpin(false)
      return
    }
    const timer = window.setTimeout(() => setSpin(true), spinnerDelayMs)
    return () => window.clearTimeout(timer)
  }, [showSpinner, spinnerDelayMs, src, state])

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    setState("loaded")
    onLoad?.(event)
  }

  function handleError(event: SyntheticEvent<HTMLImageElement>) {
    setState("error")
    onError?.(event)
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...rest}
        ref={imgRef}
        src={src}
        alt={alt}
        loading={loading ?? "eager"}
        className={`${fadeIn ? styles.image : ""} ${fadeIn && state === "loaded" ? styles.loaded : ""} ${className}`.trim()}
        data-deferred-state={state}
        onLoad={handleLoad}
        onError={handleError}
      />
      {state === "loading" && spin ? (
        <span className={styles.spinner} aria-hidden />
      ) : null}
    </>
  )
}
