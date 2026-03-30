// ═══════════════════════════════════════════════════════════════
// Adjustable Finger Angle Jig — Parametric
// 3 tools in one file: MCP, PIP, DIP
//
// HOW IT WORKS:
//   Two C-cuffs — one on each bone segment — connected at a pivot.
//   The distal arm rotates freely around the proximal arm's boss.
//   10 arc holes in the distal disk lock angles 0°–90° (every 10°).
//   One lock peg through the matching hole holds the angle rigid.
//
// PRINTING:
//   Material: TPU Shore 95A preferred (flexible, comfortable)
//   PLA also works — increase wall to 3.0
//   Layer height: 0.2mm | Walls: 3 | Infill: 40% | No supports
//   Print orientation: lay flat, disk face down on build plate
//   Print 3 lock pegs per tool
//
// STL EXPORT (OpenSCAD):
//   Put ! in front of the part you want to export, then F6 + File > Export STL
//     !proximal_arm();
//     !distal_arm();
//     !lock_peg();
//
// ASSEMBLY:
//   1. Slide proximal arm onto the bone segment above the joint
//   2. Slide distal arm onto the bone segment below the joint
//   3. Press distal arm socket over proximal arm boss (friction fit)
//   4. Rotate distal arm to target angle (clockwise = more bent)
//      Arc holes from straight: 0° 10° 20° 30° 40° 50° 60° 70° 80° 90°
//      Hole 0 (nearest lock hole) = 0° straight
//      Hole 9 (furthest, lateral) = 90° fully bent
//   5. Push lock peg through the matching arc hole — locks both disks
//
// COORDINATE SYSTEM:
//   Joint at origin. Proximal phalanx along +X. Dorsal = +Y. Palmar = -Y.
// ═══════════════════════════════════════════════════════════════

joint = "pip";    // "mcp" | "pip" | "dip"

// Diameter overrides (mm). Set to 0 to auto-select.
// Measure finger circumference with a soft tape, divide by 3.14159.
prox_diam_ov = 0;
dist_diam_ov = 0;
prox_len_ov  = 0;
dist_len_ov  = 0;

wall       = 2.5;   // Cuff wall thickness. Use 2.0 for TPU, 3.0 for PLA.
dorsal_gap = 120;   // Degrees open on dorsal/camera side. Keep >= 90.

$fn = 64;

// ── DIMENSION TABLE ───────────────────────────────────────────
// [prox_diam, dist_diam, prox_len, dist_len, pivot_r]
// pivot_r = radius of the pivot disk at the joint (palmar side only)
function jdims(j) =
    j == "mcp" ? [21, 19, 28, 24, 14] :
    j == "pip" ? [19, 17, 22, 20, 12] :
    j == "dip" ? [17, 15, 18, 16, 12] :
    [19, 17, 22, 20, 12];

jd        = jdims(joint);
prox_diam = prox_diam_ov > 0 ? prox_diam_ov : jd[0];
dist_diam = dist_diam_ov > 0 ? dist_diam_ov : jd[1];
prox_len  = prox_len_ov  > 0 ? prox_len_ov  : jd[2];
dist_len  = dist_len_ov  > 0 ? dist_len_ov  : jd[3];
pivot_r   = jd[4];

// Pivot mechanism constants
disk_h    = 5;              // Pivot disk thickness (mm)
boss_r    = 3.5;            // Boss cylinder radius (mm)
boss_h    = 5;              // Boss height — sits inside distal socket
clearance = 0.2;            // Radial clearance between boss and socket
arc_r     = pivot_r * 0.72; // Distance from pivot center to arc holes
hole_r    = 1.6;            // Lock hole radius (3.2mm diameter)
peg_r     = 1.5;            // Lock peg radius (3.0mm = 0.2mm clearance in hole)
peg_h     = disk_h * 2 + 1; // Peg length spans both disks + 1mm grip nub

// ── C-CUFF MODULES ────────────────────────────────────────────
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

module cuff(inner_d, length) {
    rotate([0, -90, 0])
    linear_extrude(height = length, center = true)
        c_profile(inner_d / 2, inner_d / 2 + wall, dorsal_gap);
}

// ── PIVOT DISK (palmar half only — keeps dorsal landmark clear) ──
module half_disk(r, h) {
    intersection() {
        cylinder(r = r, h = h, center = true);
        // Keep only Y <= 0 (palmar side)
        translate([0, -(r + 1) / 2, 0])
            cube([r * 2 + 2, r + 1, h + 2], center = true);
    }
}

// ── PROXIMAL ARM ──────────────────────────────────────────────
// Cuff on bone above joint + pivot disk (Z 0→disk_h) + boss (Z 0→-boss_h)
// Lock hole at [0, -arc_r] — the 0° reference position

module proximal_arm() {
    difference() {
        union() {
            translate([prox_len / 2, 0, 0])
                cuff(prox_diam, prox_len);
            translate([0, 0, disk_h / 2])
                half_disk(pivot_r, disk_h);
            // Boss: points toward -Z, mates into distal socket
            translate([0, 0, -boss_h / 2])
                cylinder(r = boss_r, h = boss_h, center = true);
        }
        // Lock hole: straight palmward, passes through disk + boss region
        translate([0, -arc_r, 0])
            cylinder(r = hole_r, h = (disk_h + boss_h) * 2, center = true);
    }
}

// ── DISTAL ARM ────────────────────────────────────────────────
// Cuff on bone below joint + pivot disk (Z -disk_h→0) + socket + arc holes
// Arc holes i=0..9 → joint angles 0°..90°

module distal_arm() {
    difference() {
        union() {
            translate([dist_len / 2, 0, 0])
                cuff(dist_diam, dist_len);
            translate([0, 0, -disk_h / 2])
                half_disk(pivot_r, disk_h);
        }
        // Socket: boss slides into this, full through-hole in Z
        cylinder(r = boss_r + clearance, h = disk_h * 4, center = true);
        // Arc holes: local angle = (i*10) - 90  maps hole i to joint angle i*10°
        // At joint angle θ: distal arm is rotated -θ, so hole at local (θ-90°)
        // maps to global -90° (aligned with proximal lock hole)
        for (i = [0 : 9]) {
            a = i * 10 - 90;
            translate([arc_r * cos(a), arc_r * sin(a), -disk_h / 2])
                cylinder(r = hole_r, h = disk_h + 2, center = true);
        }
    }
}

// ── LOCK PEG (print x3 per tool) ─────────────────────────────
module lock_peg() {
    // Slight taper (0.1mm) for easier insertion
    cylinder(r1 = peg_r, r2 = peg_r - 0.1, h = peg_h);
    // Grip nub at base so peg is easy to pull out
    translate([0, 0, -1])
        cylinder(r = peg_r + 1, h = 1.5);
}

// ── RENDER ────────────────────────────────────────────────────
// All 3 parts side by side. Use ! prefix to isolate for STL export.

proximal_arm();

translate([prox_len + dist_len + 20, 0, 0])
    distal_arm();

translate([(prox_len + dist_len) * 2 + 30, 0, 0])
    lock_peg();
