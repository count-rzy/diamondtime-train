import { useEffect, useRef, useState } from 'react'

const ART = '/art/'
const sceneFile = (scene) => (scene === 'tunnel' ? 'rail-tunnel-v3.png' : `rail-${scene}.png`)

const panes = [
  '89,103 269,103 273,108 273,258 269,262 89,262 85,258 85,108',
  '326,103 508,103 513,108 513,258 508,262 326,262 321,258 321,108',
  '563,103 745,103 750,108 750,258 745,262 563,262 558,258 558,108',
]

export function useReadyScene(scene, palette) {
  const [visible, setVisible] = useState(scene)
  const [outgoing, setOutgoing] = useState(null)
  const current = useRef(scene)
  useEffect(() => {
    if (scene === current.current) return
    let cancelled = false
    const files =
      scene === 'valley'
        ? [...new Set([palette.stage, palette.nextStage].map((stage) => `valley-${stage}.png`))]
        : [sceneFile(scene)]
    let pending = files.length
    const images = files.map((file) => {
      const image = new Image()
      let loaded = false
      image.onload = () => {
        if (cancelled || loaded) return
        loaded = true
        pending -= 1
        if (pending || current.current === scene) return
        setOutgoing(current.current)
        current.current = scene
        setVisible(scene)
      }
      image.onerror = () => {
        // Keep the last complete frame if an incoming asset is unavailable.
      }
      image.src = `${ART}${file}`
      if (image.complete && image.naturalWidth) image.onload()
      return image
    })
    return () => {
      cancelled = true
      images.forEach((image) => {
        image.onload = null
        image.onerror = null
      })
    }
  }, [scene, palette.stage, palette.nextStage])
  useEffect(() => {
    if (!outgoing) return
    const timeout = setTimeout(() => setOutgoing(null), 500)
    return () => clearTimeout(timeout)
  }, [outgoing, visible])
  return { visible, outgoing }
}

function Backdrop({ scene, palette }) {
  return scene === 'valley' ? (
    <g className="pixel-valley-drift">
      <image
        href={`${ART}valley-${palette.stage}.png`}
        width="836"
        height="470"
        opacity={1 - palette.stageMix}
      />
      <image
        href={`${ART}valley-${palette.nextStage}.png`}
        width="836"
        height="470"
        opacity={palette.stageMix}
      />
      <image
        href={`${ART}architecture-lights.png`}
        className="pixel-architecture-lights"
        width="836"
        height="470"
        opacity={Math.max(0.22, palette.glow)}
        style={{ '--layer-opacity': Math.max(0.22, palette.glow) }}
      />
      <image
        href={`${ART}water-shimmer.png`}
        className="pixel-water-shimmer"
        width="836"
        height="470"
      />
    </g>
  ) : (
    <image
      className="rail-region-art"
      href={`${ART}${sceneFile(scene)}`}
      width="836"
      height="470"
      preserveAspectRatio="xMidYMid slice"
      style={{ filter: `brightness(${(1.22 - palette.stars * 0.42).toFixed(2)})` }}
    />
  )
}

export default function PixelWorld({
  palette,
  progress,
  particles,
  weather = true,
  scene = 'valley',
  event = null,
  motionRate = 1,
}) {
  const svgRef = useRef(null)
  const { visible, outgoing } = useReadyScene(scene, palette)
  useEffect(() => {
    svgRef.current?.querySelectorAll('.pixel-scroll, .tunnel-passing-lights').forEach((layer) => {
      layer.getAnimations?.().forEach((animation) => animation.updatePlaybackRate(motionRate))
    })
  }, [motionRate, visible])
  const rain = weather ? Math.max(0, Math.min(0.75, (progress - 28) / 12, (53 - progress) / 12)) : 0

  return (
    <svg
      ref={svgRef}
      className="cabin-art pixel-art"
      viewBox="0 0 836 470"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <clipPath id="pixel-panes">
          {panes.map((points) => (
            <polygon key={points} points={points} />
          ))}
        </clipPath>
        <radialGradient id="pixel-lamp-glow">
          <stop stopColor="#ffd087" stopOpacity=".42" />
          <stop offset=".3" stopColor="#d47c43" stopOpacity=".12" />
          <stop offset="1" stopColor="#d47c43" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="836" height="470" fill="#0a152b" />
      <g clipPath="url(#pixel-panes)">
        <rect width="836" height="470" fill={palette.skyTop} />
        {outgoing && (
          <g className="rail-scene-exit">
            <Backdrop scene={outgoing} palette={palette} />
          </g>
        )}
        <g className={outgoing ? 'rail-scene-enter' : ''}>
          <Backdrop scene={visible} palette={palette} />
        </g>
        {visible === 'tunnel' && (
          <g className="tunnel-passing-lights">
            {[0, 1, 2, 3, 4].map((index) => (
              <rect
                key={index}
                x={index * 190}
                y="105"
                width="6"
                height="152"
                fill="#e7a35a"
                opacity=".3"
              />
            ))}
          </g>
        )}
        {event && (
          <g className="rail-world-event" aria-hidden="true">
            {['freight', 'passenger'].includes(event) ? (
              <g transform="translate(180 262)">
                <rect width="150" height="19" fill="#1b2734" stroke="#65717a" strokeWidth="2" />
                <rect x="15" y="3" width="22" height="8" fill="#e6b77b" />
                <rect x="50" y="3" width="22" height="8" fill="#e6b77b" />
                <circle cx="22" cy="21" r="5" fill="#171c25" />
                <circle cx="125" cy="21" r="5" fill="#171c25" />
              </g>
            ) : event === 'birds' ? (
              <path
                d="M270 145q8 -8 16 0q8 -8 16 0 M328 162q7 -7 14 0q7 -7 14 0"
                fill="none"
                stroke="#252c3d"
                strokeWidth="3"
              />
            ) : (
              <g transform="translate(610 216)">
                <rect width="6" height="75" fill="#29323b" />
                <circle cx="3" cy="8" r="7" fill="#d7975b" />
                <rect x="-12" y="71" width="31" height="4" fill="#4c5360" />
              </g>
            )}
          </g>
        )}
        {(visible === 'valley' || visible === 'forest') && (
          <image href={`${ART}valley-fog.png`} className="pixel-fog" width="836" height="470" />
        )}
        {(visible === 'valley' || visible === 'forest') && (
          <image
            href={`${ART}distant-birds.png`}
            className="pixel-distant-birds"
            width="836"
            height="470"
            opacity={Math.max(0, 1 - palette.stars) * 0.75}
          />
        )}
        {(visible === 'valley' || visible === 'forest') && (
          <>
            <g className="pixel-scroll pixel-scroll-mid">
              <image href={`${ART}mid-pines.png`} width="836" height="470" />
              <image href={`${ART}mid-pines.png`} x="836" width="836" height="470" />
            </g>
            <g className="pixel-scroll pixel-scroll-near">
              <image href={`${ART}near-pines.png`} width="836" height="470" />
              <image href={`${ART}near-pines.png`} x="836" width="836" height="470" />
            </g>
          </>
        )}
        {visible !== 'tunnel' && visible !== 'depot' && (
          <g className="pixel-scroll pixel-scroll-ground">
            <image href={`${ART}foreground-ground.png`} width="836" height="470" />
            <image href={`${ART}foreground-ground.png`} x="836" width="836" height="470" />
          </g>
        )}
        {rain > 0 && (
          <g opacity={rain}>
            {[0, 1, 2, 3].map((frame) => (
              <image
                key={frame}
                href={`${ART}rain-${frame}.png`}
                className="pixel-rain-frame"
                width="836"
                height="470"
                opacity={frame === 0 ? 1 : 0}
                style={{ animationDelay: `${-frame * 0.25}s` }}
              />
            ))}
          </g>
        )}
        <image href={`${ART}glass.png`} width="836" height="470" />
        <image href={`${ART}glass-rain.png`} width="836" height="470" opacity={rain} />
        {particles && palette.stars > 0 && (
          <g opacity={palette.stars}>
            {[172, 232, 351, 457, 611, 690].map((x, index) => (
              <svg
                key={x}
                className="pixel-firefly"
                x={x}
                y={174 + (index % 3) * 18}
                width="8"
                height="8"
                viewBox="0 0 8 8"
                style={{ animationDelay: `${-index * 0.37}s` }}
              >
                <image href={`${ART}firefly-strip.png`} width="32" height="8" />
              </svg>
            ))}
          </g>
        )}
      </g>

      <image href={`${ART}carriage.png`} width="836" height="470" />
      <image href={`${ART}carriage-detail.png`} width="836" height="470" />
      <image
        href={`${ART}lamp-light.png`}
        className="pixel-lamp-light"
        width="836"
        height="470"
        opacity={palette.glow}
        style={{ '--layer-opacity': palette.glow }}
      />
      <circle cx="45" cy="79" r="82" fill="url(#pixel-lamp-glow)" opacity={palette.glow} />
      <circle cx="791" cy="79" r="82" fill="url(#pixel-lamp-glow)" opacity={palette.glow} />
      {particles && (
        <g opacity={Math.max(0.22, palette.glow) * 0.68}>
          {[
            [54, 173],
            [69, 247],
            [33, 329],
            [93, 295],
            [769, 179],
            [799, 256],
            [739, 316],
            [810, 355],
          ].map(([x, y], index) => (
            <rect
              key={`${x}-${y}`}
              className="pixel-dust-mote"
              x={x}
              y={y}
              width={index % 3 === 0 ? 2 : 1}
              height="1"
              fill="#ffd6a0"
              style={{ animationDelay: `${-index * 0.8}s` }}
            />
          ))}
        </g>
      )}
    </svg>
  )
}
