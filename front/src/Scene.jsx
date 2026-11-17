import { t, useLanguage } from './i18n'
import { useMemo } from 'react'
import { atmosphere } from './journey'

const stars = Array.from({ length: 55 }, (_, i) => ({
  x: (i * 197 + 53) % 1440,
  y: ((i * 83 + 31) % 275) + 18,
  r: i % 7 === 0 ? 2 : 1,
}))
const pines = Array.from({ length: 34 }, (_, i) => ({ x: i * 48 - 28, h: 44 + ((i * 37) % 85) }))
const grass = Array.from({ length: 90 }, (_, i) => ({
  x: (i * 79) % 1440,
  y: 525 + ((i * 13) % 60),
}))

function Pine({ x, y, h, shade }) {
  return (
    <g transform={`translate(${x} ${y})`} fill={shade} shapeRendering="crispEdges">
      <rect x="-3" y={-h * 0.2} width="6" height={h * 0.2} fill="#172635" />
      <path
        d={`M0 ${-h} L${h * 0.28} ${-h * 0.48} H${h * 0.17} L${h * 0.38} ${-h * 0.12} H${-h * 0.38} L${-h * 0.17} ${-h * 0.48} H${-h * 0.28} Z`}
      />
      <path
        d={`M0 ${-h * 0.82} L${h * 0.17} ${-h * 0.48} H${-h * 0.17} Z`}
        fill="#ffffff"
        opacity=".045"
      />
    </g>
  )
}

function Wheel({ x }) {
  return (
    <g className="wheel" style={{ transformOrigin: `${x}px 454px` }}>
      <circle cx={x} cy="454" r="20" fill="#111b29" stroke="#77818a" strokeWidth="5" />
      <circle cx={x} cy="454" r="9" fill="#3e5360" />
      <path d={`M${x - 17} 454 H${x + 17} M${x} 437 V471`} stroke="#a3a69c" strokeWidth="3" />
    </g>
  )
}

function Train({ progress, running, glow }) {
  const x = 30 + Math.min(1, progress / 100) * 750
  return (
    <g
      className={running ? 'train running' : 'train'}
      style={{ transform: `translateX(${x}px)` }}
      shapeRendering="crispEdges"
    >
      <g transform="translate(356 0) scale(-1 1)">
        <ellipse cx="170" cy="484" rx="205" ry="14" fill="#080e1b" opacity=".45" />
        <g className="steam">
          <circle cx="44" cy="308" r="11" fill="#d4d4cc" opacity=".32" />
          <circle cx="53" cy="285" r="15" fill="#d4d4cc" opacity=".25" />
          <circle cx="62" cy="258" r="17" fill="#d4d4cc" opacity=".15" />
        </g>
        <rect
          x="-8"
          y="391"
          width="143"
          height="54"
          fill="#26333d"
          stroke="#0d1720"
          strokeWidth="5"
        />
        <rect x="15" y="365" width="75" height="28" fill="#283b46" />
        <rect x="35" y="346" width="30" height="20" fill="#1b2933" />
        <rect x="-19" y="414" width="22" height="17" fill="#c88455" />
        <rect x="-14" y="405" width="12" height="10" fill="#ffe2a1" style={{ opacity: glow }} />
        <path d="M98 370 H124 L137 390 H98 Z" fill="#26333d" />
        <rect x="105" y="372" width="18" height="18" fill="#f1b966" style={{ opacity: glow }} />
        <rect x="-8" y="441" width="151" height="10" fill="#b57556" />
        <rect x="11" y="398" width="88" height="6" fill="#a66b51" />
        <rect
          x="150"
          y="394"
          width="206"
          height="51"
          fill="#34404a"
          stroke="#121c29"
          strokeWidth="5"
        />
        <rect x="150" y="380" width="206" height="16" fill="#233541" />
        {[167, 209, 251, 293].map((left) => (
          <g key={left}>
            <rect
              x={left}
              y="399"
              width="30"
              height="28"
              fill="#f9c477"
              style={{ opacity: glow }}
            />
            <rect x={left + 2} y="401" width="26" height="24" fill="#bf7e52" opacity=".25" />
            <path d={`M${left + 15} 399 V428`} stroke="#172638" strokeWidth="3" />
          </g>
        ))}
        <rect x="337" y="399" width="11" height="38" fill="#182938" />
        <rect x="150" y="439" width="206" height="12" fill="#b57556" />
        <rect x="138" y="423" width="14" height="8" fill="#a3a69c" />
        <rect x="356" y="423" width="15" height="8" fill="#a3a69c" />
        {[24, 87, 187, 245, 318].map((left) => (
          <Wheel key={left} x={left} />
        ))}
        <path d="M24 454 H89 M187 454 H318" stroke="#88969a" strokeWidth="4" />
        <rect x="4" y="443" width="124" height="6" fill="#182532" />
        <rect x="159" y="443" width="188" height="6" fill="#182532" />
      </g>
    </g>
  )
}

export default function Scene({
  progress = 0,
  durationMinutes = 60,
  running = true,
  reducedMotion = false,
  particles = true,
  title = t('ui.the_journey_begins'),
}) {
  useLanguage()

  const palette = atmosphere(progress, durationMinutes)
  const nearStation = progress >= 82
  const arrived = progress >= 100
  return (
    <div
      className={`scene ${reducedMotion ? 'still' : ''} ${arrived ? 'arrived' : ''}`}
      role="img"
      aria-label={t('journey.scene_label', {
        stage: palette.name.toLowerCase(),
        progress: Math.round(progress),
      })}
    >
      <svg viewBox="0 0 1440 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="sky" x2="0" y2="1">
            <stop stopColor={palette.skyTop} />
            <stop offset="1" stopColor={palette.skyBottom} />
          </linearGradient>
          <linearGradient id="haze" x2="0" y2="1">
            <stop stopColor="#fbc495" stopOpacity=".2" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <pattern id="rail" width="54" height="22" patternUnits="userSpaceOnUse">
            <rect width="54" height="22" fill="#101a25" />
            <rect x="4" width="10" height="22" fill="#4b423e" />
            <rect x="30" width="10" height="22" fill="#4b423e" />
          </pattern>
        </defs>
        <rect width="1440" height="600" fill="url(#sky)" />
        <g opacity={palette.stars}>
          {stars.map((star, i) => (
            <rect
              className="star"
              key={i}
              x={star.x}
              y={star.y}
              width={star.r * 2}
              height={star.r * 2}
              fill="#fff5d5"
              style={{ animationDelay: `${(i % 9) * -0.6}s` }}
            />
          ))}
        </g>
        <circle cx="1157" cy="111" r="36" fill="#fff3c8" opacity={palette.moon} />
        <circle cx="1157" cy="111" r="54" fill="#fff3c8" opacity={palette.moon * 0.1} />
        <circle
          cx="268"
          cy="270"
          r="85"
          fill="#ffcf8a"
          opacity={Math.max(0.05, 1 - palette.stars) * 0.42}
        />
        <g className="clouds" fill="#fff4dc" opacity=".17">
          <path d="M100 116 h64 v-12 h28 v-10 h42 v10 h30 v15 h46 v12 H100Z M630 180 h56 v-12 h49 v-16 h56 v15 h38 v13 h59 v12 H630Z M1090 79 h70 v-14 h46 v-10 h46 v12 h53 v13 h45 v13 h-260Z" />
        </g>
        <path
          d="M0 354 L88 276 L131 311 L237 214 L334 330 L411 254 L529 342 L611 224 L701 328 L778 279 L891 346 L984 230 L1077 331 L1199 252 L1327 338 L1440 249 V500 H0Z"
          fill={palette.mountain}
        />
        <path
          d="M0 387 L144 348 L253 363 L356 307 L511 385 L626 342 L744 365 L861 311 L1007 374 L1122 328 L1282 369 L1440 315 V510 H0Z"
          fill={palette.far}
        />
        <rect y="344" width="1440" height="115" fill="url(#haze)" />
        <g className="forest-far">
          {pines.map((tree, i) => (
            <Pine key={i} x={tree.x} y={422 + (i % 3) * 7} h={tree.h} shade={palette.forest} />
          ))}
        </g>
        <path
          d="M0 427 Q165 410 284 436 T597 421 T914 433 T1237 419 T1440 428 V600 H0Z"
          fill={palette.ground}
        />
        <g
          opacity={nearStation ? 1 : 0.16}
          style={{ transition: 'opacity 1.5s' }}
          shapeRendering="crispEdges"
        >
          <rect x="1134" y="354" width="156" height="94" fill="#202c38" />
          <path d="M1117 359 L1155 331 H1277 L1305 359Z" fill="#5d4a51" />
          <rect
            x="1150"
            y="380"
            width="38"
            height="37"
            fill="#edba6f"
            style={{ opacity: palette.glow }}
          />
          <rect
            x="1202"
            y="380"
            width="37"
            height="37"
            fill="#edba6f"
            style={{ opacity: palette.glow }}
          />
          <rect x="1253" y="381" width="23" height="66" fill="#122334" />
          <rect x="1104" y="447" width="225" height="12" fill="#796963" />
          <rect x="1082" y="344" width="9" height="104" fill="#514b4a" />
          <rect x="1065" y="339" width="42" height="9" fill="#c8a377" />
          <text
            x="1086"
            y="335"
            textAnchor="middle"
            fill="#f3d5a6"
            fontSize="11"
            fontFamily="monospace"
          >
            {t('ui.last_stop_2')}{' '}
          </text>
        </g>
        <rect y="461" width="1440" height="7" fill="#111d26" />
        <rect y="475" width="1440" height="27" fill="url(#rail)" />
        <rect y="476" width="1440" height="5" fill="#849096" />
        <rect y="498" width="1440" height="5" fill="#77848a" />
        <Train
          progress={progress}
          running={running && !arrived && !reducedMotion}
          glow={Math.max(0.6, palette.glow)}
        />
        <path
          d="M0 513 Q200 495 399 517 T796 512 T1193 514 T1440 505 V600 H0Z"
          fill={palette.ground}
        />
        <g fill="#456556" opacity=".65">
          {grass.map((blade, i) => (
            <path key={i} d={`M${blade.x} ${blade.y} l-3 -8 l4 5 l3 -10 l2 13Z`} />
          ))}
        </g>
        {particles && (
          <g className="fireflies" opacity={palette.stars}>
            {[147, 389, 604, 915, 1044, 1282].map((x, i) => (
              <circle
                key={i}
                cx={x}
                cy={405 + (i % 3) * 26}
                r="2.5"
                fill="#ffe8a4"
                style={{ animationDelay: `${i * -0.9}s` }}
              />
            ))}
          </g>
        )}
        <path d="M0 566 H1440" stroke="#53634d" strokeWidth="2" opacity=".4" />
      </svg>
      <div className="scene-badge">
        <span className="live-dot" /> {arrived ? t('ui.arrived') : palette.name.toUpperCase()}{' '}
        <span className="badge-separator">/</span> {title}
      </div>
      {arrived && (
        <div className="arrival-overlay">
          <span>{t('ui.destination_reached_2')}</span>
          <strong>{t('ui.welcome_to_the_last_stop')}</strong>
        </div>
      )}
    </div>
  )
}
