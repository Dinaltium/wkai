# Product

## Register

product

## Users

Two distinct users in a live technical-workshop setting:

- **Instructors** — run the session from a lightweight Tauri desktop app. They teach normally (screen + voice); WKAI silently captures and does the rest. Context: presenting live, hands full, cannot babysit a tool. They need it to run in the background and not interrupt the flow.
- **Students** — join a room with a 6-character code in a browser (zero install), often on shared/locked-down lab machines. They follow the instructor's live video + AI-generated step guides, take comprehension checks, and paste errors for AI diagnosis. Context: mid-task, varying skill levels, time-pressured, anxious about falling behind.

## Product Purpose

A real-time AI workshop assistant. The instructor teaches; WKAI captures screen + audio, and AI (Groq/LangGraph) generates live step-by-step guides, comprehension quizzes, and error diagnosis, delivered to every student in real time. It exists to solve students falling behind in live technical sessions without needing a human TA per student. Success = students keep pace and get unblocked instantly, while the instructor does nothing beyond teaching.

## Brand Personality

*(inferred — confirm/adjust)* Unobtrusive, dependable, focused. The product's whole value is that it runs quietly in the background, so the UI voice is calm and confident, never attention-seeking. Emotional goals: relieve student anxiety about falling behind; give the instructor confidence that it "just works" without their attention.

## Anti-references

*(inferred — confirm/adjust)*
- **Not gamified consumer edtech** — no confetti, streaks, mascots, XP. This is a working tool during real teaching, not Duolingo.
- **Not a heavy enterprise LMS** — avoid Blackboard/Moodle clutter, nested menus, admin density.
- **Not attention-grabbing SaaS-dashboard slop** — no hero-metric template, no big-number-gradient panels. The tool must never pull focus from the instructor.

## Design Principles

*(1–3 inferred from purpose; confirm/adjust)*
1. **Stay out of the way** — the instructor teaches; the tool is ambient. Silence and restraint are features.
2. **Clarity under time pressure** — students are mid-task; guide steps, quiz prompts, and error fixes must be instantly scannable, not decorative.
3. **Trust through transparency** — show AI availability/status honestly (it already surfaces "AI unavailable" states); never fake certainty in a diagnosis.
4. **Zero-friction entry** — students join with a code, no install; nothing should gate getting into a room.
5. **Calm, not gamified** — reassurance over reward mechanics.

## Accessibility & Inclusion

*(inferred — confirm/adjust)* Target WCAG 2.2 AA. Live transcripts/captions are already core (audio→text). Status signals (correct/incorrect answers, AI availability, connection state) must not rely on color alone — pair with icon/text. Respect `prefers-reduced-motion`. Full keyboard navigation for the student room. Readable body contrast on the dark surfaces used in both apps.
