// ═══════════════════════════════════════════════════════════════
// Finger Angle Jig — Parametric v2
// Supports all 14 joints tracked by PhalanX / MediaPipe:
//   Thumb:                   MCP, IP
//   Index / Middle / Ring / Little:  MCP, PIP, DIP
//
// Design: two C-shaped cuffs (palmar-side only) bridged at the joint.
// Dorsal face fully open — MediaPipe landmarks remain unobstructed.
//
// PRINT SETTINGS:
//   Material: TPU Shore 95A (flexible, comfortable) — preferred
//             PLA works but is rigid; increase wall to 3.0 mm
//   Layer height: 0.2 mm | Walls: 3 | Infill: 40% | No supports
//   Orientation: flat on build plate (bridge face down)
//
// USAGE:
//   1. Set finger + joint below
//   2. Set angle (0 = straight, 90 = fully bent)
//   3. Print, slip onto finger, record ML samples
//   4. If cuffs are tight/loose, measure finger circumference
//      with a soft tape, divide by 3.14159, and override with
//      prox_diam_ov / dist_diam_ov
//
// COORDINATE SYSTEM:
//   Joint at origin. Proximal phalanx along +X. Dorsal = +Y.
// ═══════════════════════════════════════════════════════════════

// ── USER PARAMETERS ───────────────────────────────────────────

finger = "index";   // "thumb" | "index" | "middle" | "ring" | "little"
joint  = "pip";     // thumb: "mcp" | "ip"    others: "mcp" | "pip" | "dip"
angle  = 45;        // Flexion angle in degrees. 0 = straight, 90 = right angle.

// Diameter overrides — set to 0 to auto-select from lookup table.
// Measure: wrap soft tape around finger at that segment, divide by pi.
prox_diam_ov = 0;   // Proximal cuff inner diameter (mm)
dist_diam_ov = 0;   // Distal cuff inner diameter (mm)
prox_len_ov  = 0;   // Proximal cuff length along finger (mm)
dist_len_ov  = 0;   // Distal cuff length along finger (mm)

wall       = 2.5;   // Cuff wall thickness. 2.0 for TPU, 3.0 for PLA.
dorsal_gap = 120;   // Degrees open on camera/dorsal side. Min ~90 to stay on.
                    // Wider = easier to put on + less visual interference.

$fn = 64;

// ── DIMENSION LOOKUP TABLE ────────────────────────────────────
// [prox_diam, dist_diam, prox_len, dist_len] — all in mm
// Diameters are finger segment inner diameters for an average adult hand.
// Lengths are cuff lengths along the bone axis.
//
// Joints per finger (proximal → distal):
//   Thumb:   MCP (knuckle at base), IP (interphalangeal)
//   Fingers: MCP (knuckle at base), PIP (middle knuckle), DIP (tip knuckle)

function dims(f, j) =
    // ── Thumb ──────────────────────────────────────────────────
    f == "thumb"  && j == "mcp" ? [23, 21, 28, 24] :
    f == "thumb"  && j == "ip"  ? [21, 18, 22, 18] :
    // ── Index ──────────────────────────────────────────────────
    f == "index"  && j == "mcp" ? [21, 19, 28, 24] :
    f == "index"  && j == "pip" ? [19, 17, 22, 20] :
    f == "index"  && j == "dip" ? [17, 15, 18, 16] :
    // ── Middle ─────────────────────────────────────────────────
    f == "middle" && j == "mcp" ? [22, 20, 28, 24] :
    f == "middle" && j == "pip" ? [20, 18, 22, 20] :
    f == "middle" && j == "dip" ? [18, 16, 18, 16] :
    // ── Ring ───────────────────────────────────────────────────
    f == "ring"   && j == "mcp" ? [20, 18, 28, 24] :
    f == "ring"   && j == "pip" ? [18, 16, 22, 20] :
    f == "ring"   && j == "dip" ? [16, 14, 18, 16] :
    // ── Little ─────────────────────────────────────────────────
    f == "little" && j == "mcp" ? [17, 15, 28, 24] :
    f == "little" && j == "pip" ? [15, 13, 22, 20] :
    f == "little" && j == "dip" ? [13, 11, 18, 16] :
    [18, 16, 22, 20]; // fallback

d = dims(finger, joint);

prox_diam = prox_diam_ov > 0 ? prox_diam_ov : d[0];
dist_diam = dist_diam_ov > 0 ? dist_diam_ov : d[1];
prox_len  = prox_len_ov  > 0 ? prox_len_ov  : d[2];
dist_len  = dist_len_ov  > 0 ? dist_len_ov  : d[3];

// ── C-SHAPED CROSS-SECTION ────────────────────────────────────
// Drawn in XY plane. Gap opens at +Y (dorsal = camera side).
module c_profile(inner_r, outer_r, gap_deg) {
    difference() {
        difference() {
            circle(r = outer_r);
            circle(r = inner_r);
        }
        polygon(concat(
            [[0, 0]],
            [for (a = [90 - gap_deg/2 : 1 : 90 + gap_deg/2])
                [(outer_r + 1) * cos(a), (outer_r + 1) * sin(a)]]
        ));
    }
}

// ── CUFF ──────────────────────────────────────────────────────
module cuff(inner_d, length, gap_deg) {
    rotate([0, -90, 0])
    linear_extrude(height = length, center = true)
        c_profile(inner_d / 2, inner_d / 2 + wall, gap_deg);
}

// ── ANGLE REFERENCE TICK ──────────────────────────────────────
// Small raised ridge on the bridge at the joint hinge — lets you
// verify the printed angle with a goniometer before recording.
module angle_tick() {
    rotate([0, 0, -angle / 2])
    translate([prox_diam / 2 + wall + 0.5, 0, 0])
        cube([1.2, wall * 2, min(prox_diam, dist_diam) * 0.4], center = true);
}

// ── ASSEMBLY ──────────────────────────────────────────────────

// 1. Proximal cuff
translate([prox_len / 2, 0, 0])
    cuff(prox_diam, prox_len, dorsal_gap);

// 2. Distal cuff (flexed toward palm)
rotate([0, 0, -angle])
    translate([dist_len / 2, 0, 0])
    cuff(dist_diam, dist_len, dorsal_gap);

// 3. Palmar bridge — smooth hull between the two cuffs at the joint
hull() {
    translate([wall, -(prox_diam / 2 + wall / 2), 0])
        cube([wall * 2, wall, prox_diam * 0.5], center = true);

    rotate([0, 0, -angle])
    translate([wall, -(dist_diam / 2 + wall / 2), 0])
        cube([wall * 2, wall, dist_diam * 0.5], center = true);
}

// 4. Angle reference tick (palmar side, at bisector of the joint angle)
angle_tick();
