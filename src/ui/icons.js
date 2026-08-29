// Original hand-authored SVG shapes for the HUD's vitals: a heart for
// health and a drumstick for hunger, instead of plain colored squares.
// `stateClass` controls color/opacity via CSS (see main.css: .bar-icon.*).

const HEART_PATH = 'M10 17.5 C10 17.5 2.2 11.9 2.2 6.6 C2.2 3.6 4.5 1.6 7.2 1.6 C8.8 1.6 10 2.6 10 4 C10 2.6 11.2 1.6 12.8 1.6 C15.5 1.6 17.8 3.6 17.8 6.6 C17.8 11.9 10 17.5 10 17.5 Z';

export function heartIconMarkup(stateClass) {
  return `<svg viewBox="0 0 20 20" class="bar-icon heart ${stateClass}"><path d="${HEART_PATH}"/></svg>`;
}

export function drumstickIconMarkup(stateClass) {
  return `<svg viewBox="0 0 20 20" class="bar-icon hunger ${stateClass}">
    <rect x="0.8" y="11.3" width="9.6" height="3.1" rx="1.55" transform="rotate(-38 5.6 12.85)"/>
    <circle cx="1.8" cy="16.6" r="2.3"/>
    <ellipse cx="13" cy="7" rx="6" ry="5.2" transform="rotate(-28 13 7)"/>
  </svg>`;
}
