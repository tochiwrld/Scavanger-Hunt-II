// Star hunt camera maths: where the back camera points, and where a star at (bearing, elevation) lands on screen.
// Earth frame: x = East, y = North, z = Up. Device frame (W3C): x = right, y = top of the phone, z = out of the screen.
const D2R = Math.PI / 180;
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
export const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

/**
 * Camera pose from deviceorientation angles (degrees; alpha already turned into a true-north value).
 * screenAngle = screen.orientation.angle (0 portrait, 90/270 landscape). Returns forward/up/right unit vectors (earth frame).
 */
export function poseFromOrientation(alpha, beta, gamma, screenAngle = 0) {
  const a = alpha * D2R, b = beta * D2R, g = gamma * D2R;
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  // Columns of R = Rz(alpha) * Rx(beta) * Ry(gamma): the device's x, y, z axes written in earth coordinates.
  const X = [cA * cG - sA * sB * sG, cG * sA + cA * sB * sG, -cB * sG];
  const Y = [-cB * sA, cA * cB, sB];
  const Z = [cG * sA * sB + cA * sG, sA * sG - cA * cG * sB, cB * cG];
  const fwd = [-Z[0], -Z[1], -Z[2]]; // the back camera looks out of the back of the phone
  const t = (screenAngle || 0) * D2R, c = Math.cos(t), s = Math.sin(t);
  const up = [c * Y[0] - s * X[0], c * Y[1] - s * X[1], c * Y[2] - s * X[2]];
  return frame(fwd, up);
}

/** Pose for computers: drag sets heading and pitch, no roll. */
export function poseFromHeadingPitch(heading, pitch) {
  const h = heading * D2R, p = pitch * D2R;
  return frame([Math.sin(h) * Math.cos(p), Math.cos(h) * Math.cos(p), Math.sin(p)], [-Math.sin(h) * Math.sin(p), -Math.cos(h) * Math.sin(p), Math.cos(p)]);
}

/** Clean up a forward/up pair into an orthonormal camera frame (right = forward × up). */
export function frame(fwd, up) {
  const f = unit(fwd);
  const u = unit([up[0] - f[0] * dot(up, f), up[1] - f[1] * dot(up, f), up[2] - f[2] * dot(up, f)]);
  return { f, u, r: crossV(f, u) };
}

/** Time-based smoothing (same feel at 60 Hz and 120 Hz). tau in seconds. */
export function smoothPose(prev, next, dt, tau = 0.07) {
  if (!prev) return next;
  const k = 1 - Math.exp(-Math.max(0, dt) / tau);
  const mix = (a, b) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  return frame(mix(prev.f, next.f), mix(prev.u, next.u));
}

/** Compass heading (0 = north, clockwise) of where the camera points. */
export const poseHeading = (p) => ((Math.atan2(p.f[0], p.f[1]) / D2R) + 360) % 360;

/** Direction of a star seen at bearing (deg from north) and elevation (deg above the horizon). */
export const dirFrom = (bearing, elev) => {
  const b = bearing * D2R, e = elev * D2R;
  return [Math.sin(b) * Math.cos(e), Math.cos(b) * Math.cos(e), Math.sin(e)];
};

/** Screen position of a direction: { x, y, ahead } (ahead = false when it's behind the camera). */
export function project(p, dir, cx, cy, focalPx) {
  const z = dot(dir, p.f);
  if (z < 0.02) return { x: 0, y: 0, ahead: false };
  return { x: cx + (dot(dir, p.r) / z) * focalPx, y: cy - (dot(dir, p.u) / z) * focalPx, ahead: true };
}

/**
 * Focal length in screen pixels for a camera picture shown with object-fit: cover.
 * Phone main cameras see about 65° across their long side; the picture is scaled up to cover the screen.
 */
export function focalFor(W, H, videoW, videoH, longFov = 65) {
  if (videoW > 0 && videoH > 0) {
    const fVideo = (Math.max(videoW, videoH) / 2) / Math.tan((longFov / 2) * D2R);
    return fVideo * Math.max(W / videoW, H / videoH);
  }
  return (W / 2) / Math.tan(31 * D2R); // no camera picture: about 62° across the screen width
}
