# Rounded overlap design · interim classroom construction

19 November 2026 · v0.7.7

## Implemented construction

New pin-connected splits use two complete, concentric rounded ends, one united with each original cut piece. Their diameter covers the measured width of the split section, with a small allowance for the 96-segment cut-contour approximation. The pin hole is a separate physical dimension. This replaces the previous small fastener-margin disk; simply enlarging a displayed marker would not change the material.

The overlap remains common to both pieces as they rotate about their shared pivot. Width/length changes transform the stored section vectors and update the paired circular ends without stretching pin holes. Joint-size changes retain the physical scale, rest pose and source artwork. Joint-size changes respect locks on either connected piece. Global print-height and pin-hole settings retain their independent behavior. Older files keep their saved joint sizes until explicitly edited.

Connecting two already separate pieces has no original split section. It uses the smaller oriented width of the selected pieces plus their gap as a geometric starting estimate. Review and adjust this estimate; it is not anatomical recognition. Arbitrary vertex edits also require a fresh size/movement review.

The image for each piece is clipped to its original polygon. Newly added material uses the editable piece/overlap color. This prevents a wider tab from copying neighboring limbs or background pixels. Hidden artwork is not generated or reconstructed.

## Student workflow

Keep Create → Refine → Make. Select a dot, try its movement and inspect both overlap layers. Joint size remains optional and collapsed. The control adjusts the round ends together, independently of the pin hole. Accept the reviewed plan, then make a paper prototype before using the intended material.

The print guide asks students to test each intended bend and inspect gaps, catching, hole looseness, dark overlaps and readable detail against a backlit screen. These are physical checks to perform, not automated certifications.

## Evidence and limits

Automated geometry and workflow evidence is recorded in [VALIDATION.md](VALIDATION.md). The shared rounded material, exact holes, physical scale and export contours can be checked deterministically. Actual material strength, fastener behavior, rod control and transmitted light still require a physical puppet.

This is an interim engineering improvement. It is not presented as a practitioner-approved historical reconstruction. A larger solid overlap can darken translucent material. Wheel-like openings are documented in the Beijing East City tradition, but their pattern, structural bridges, material and regional appropriateness need practitioner review before being offered as a traditional construction preset.

## Next review with a practising maker/puppeteer

1. Select and credit a regional reference tradition and examples.
2. Review round-end proportions, layer order, fasteners, movement ranges and control rods on three physical samples: a narrow limb, a broad sleeve and a nonhuman character.
3. Determine whether radial openings or another light-transmitting joint treatment is appropriate, and establish material-specific minimum bridges through physical tests.
4. Refine hidden artwork treatment and the distinction between printed color, translucent color and actual cut-outs.
5. Record the student's decisions, AI contribution and fabrication method; describe modern characters as contemporary adaptations.
6. Include manipulation and a short performed scene in the learning task. Assess skill acquisition and continued participation, alongside artifact quality.

## Reference basis

- Lisa Kronthal, *Conservation of Chinese Shadow Figures: Investigations into Their Manufacture, Storage, and Treatment*, JAIC 40(1), 2001, section 3: https://cool.culturalheritage.org/jaic/articles/jaic40-01-001.html
- Chinese Shadow Puppetry, *Engineering*: https://www.chineseshadowpuppetry.com/engineering
- UNESCO, *Ethical Principles for Safeguarding Intangible Cultural Heritage*: https://ich.unesco.org/en/ethics-and-ich-00866

These sources motivate the review criteria. They do not certify this software's dimensions or establish a single universal joint standard.
