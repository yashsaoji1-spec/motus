# UI Rules

**No emojis — ever.** Not in HTML, JS strings, CSS content, button labels, messages, icons, or favicons. Use plain text or ASCII symbols (`+`, `-`, `x`) instead.

## CSS Variables (styles.css `:root`)

Patient scope (auth screens, patient flows):

```css
--bg             #F0F9FF                    /* page background */
--surface        #FFFFFF                    /* card/panel background */
--border         #E0F2FE                    /* borders and grid lines */
--accent         #0EA5E9                    /* blue — primary interactive color */
--accent-hover   #0284C7
--accent-dim     rgba(14, 165, 233, 0.08)
--accent-glow    rgba(14, 165, 233, 0.25)
--text           #0C4A6E                    /* primary text */
--muted          #475569                    /* secondary/disabled text */
--placeholder    #94A3B8
--danger         #CC2936                    /* error states, pain indicator */
--success        #10B981                    /* success / positive states */
--gold           #F59E0B                    /* streaks / achievement highlights */
--gold-dim       rgba(245, 158, 11, 0.12)
--gradient-cta          linear-gradient(135deg, #0EA5E9, #059669)
--gradient-cta-hover    linear-gradient(135deg, #0284C7, #047857)
--font-mono      'DM Mono', monospace
```

Typography scale (global):

```css
--text-xs: 0.75rem  --text-sm: 0.875rem  --text-base: 1rem
--text-lg: 1.125rem  --text-xl: 1.25rem  --text-2xl: 1.5rem
--font-semibold: 600
--surface-alt: var(--th-surface-hover)   /* resolves inside .therapist-scope */
```

Therapist scope (defined on `.therapist-scope`, lines 74–92 in styles.css):

```css
--th-primary:       #2563EB                /* therapist blue */
--th-text:          #334155
--th-text-strong:   #0F172A
--th-muted:         #94A3B8
--th-bg:            #FFFFFF
--th-surface:       #FAFAFA                /* card background */
--th-border:        #E2E8F0                /* borders */
--th-sidebar-bg:    #1E293B                /* icon sidebar */
--th-radius:        6px
--th-font:          'IBM Plex Sans', sans-serif
--th-surface-hover: #F8FAFC
--th-surface-active: #EFF6FF
--th-badge-bg:      #EFF6FF
--th-badge-border:  #BFDBFE
--th-input-bg:      #F1F5F9
```

Use `--th-*` tokens for all therapist/clinic screen CSS. Use patient tokens for auth and patient flows.

