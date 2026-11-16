---
name: canvy-diagrams
description: Draw a flowchart, process, architecture, org chart or decision tree as an editable hand-drawn Canvy diagram link (Thai or English). Use when someone asks to draw, diagram, sketch or visualize steps, systems or structures.
---

# Canvy diagrams

Canvy (https://kimookpong.github.io/canvy/) is a free hand-drawn diagram editor in Thai and English. A diagram can travel inside a link as plain text: opening the link builds it as an editable diagram in the person's browser. Nothing is uploaded.

## How to deliver a diagram

1. Work out the boxes and arrows from the request. Keep labels to 1–4 words, in the language the person used.
2. Write it in Canvy syntax (below). Mermaid `flowchart` syntax is also accepted.
3. If the Canvy connector is available (tool `create_diagram`), call it with `diagram`, `title`, and `direction` (`TB` for org charts, approvals and long processes; `LR` otherwise). Give the person the edit link it returns.
4. Otherwise, build the link yourself:
   `https://kimookpong.github.io/canvy/app/#c=<diagram>&title=<title>&dir=<LR|TB>`
   - If you can run code, use `encodeURIComponent` (JS) or `urllib.parse.quote(s, safe='')` (Python) on `diagram` and `title`.
   - Without code, encode at least: space → `%20`, new line → `%0A`, `&` → `%26`, `#` → `%23`, `%` → `%25`, `+` → `%2B`, `?` → `%3F`. Thai letters can stay as they are.
   - Present it as a Markdown link, e.g. `[เปิดไดอะแกรมใน Canvy](https://kimookpong.github.io/canvy/app/#c=...)`.
5. Also show the diagram text in a code block so the person can read and tweak it, and mention they can paste it into Canvy's command bar.
6. For a read-only link add `?view=1` before `#`. Optional `&style=` one of `pencil` (default), `chalk`, `marker`, `blueprint`, `ink`, `neon`.

## Canvy syntax

| Write | Gives |
| --- | --- |
| `a -> b -> c` | Boxes joined by arrows |
| `a -(label)-> b` or `a -> b: label` | Label on an arrow |
| `a -- b` · `a <-> b` · `a ..> b` | Plain line · two-way · dashed |
| `db:Orders` `queue:Jobs` `user:Customer` `note:Text` `cloud:CDN` `doc:Report` `io:Input` `hex:Step` `start:Begin` `end:Done` `decision:OK?` `card:Title` | Shape by prefix |
| `[(Orders)]` `(Round)` `{Decision?}` `{{Hex}}` `[/Input/]` `([Pill])` | Shape by brackets |
| `## Heading` | Section title above what follows |
| `,` `;` or new line | Start another chain |

The same label is the same box, so write branches as separate chains that repeat it:

```
start:รับคำสั่งซื้อ -> ตรวจสต็อก -> {มีของ?}
{มีของ?} -(มี)-> จัดส่ง -> end:เสร็จ
{มีของ?} -(ไม่มี)-> แจ้งลูกค้า
```

## Good diagrams

- 3–25 boxes. Split bigger systems with `## Heading` sections or into two diagrams.
- Decisions as `{…?}` with every way out labelled.
- `db:` for data stores, `user:` for people, `queue:` for queues, `start:`/`end:` for the ends of a process.
- One idea per chain; repeat a label to branch or join.

## Example

Request: "วาดขั้นตอนอนุมัติเอกสาร"

```
start:ยื่นคำขอ -> หัวหน้าตรวจ -> {อนุมัติ?}
{อนุมัติ?} -(อนุมัติ)-> ฝ่ายบัญชีดำเนินการ -> end:เสร็จ
{อนุมัติ?} -(ไม่อนุมัติ)-> แก้ไขเอกสาร -> หัวหน้าตรวจ
```

Link (direction TB): `https://kimookpong.github.io/canvy/app/#c=start:ยื่นคำขอ%20-%3E%20หัวหน้าตรวจ%20-%3E%20{อนุมัติ%3F}%0A{อนุมัติ%3F}%20-(อนุมัติ)-%3E%20ฝ่ายบัญชีดำเนินการ%20-%3E%20end:เสร็จ%0A{อนุมัติ%3F}%20-(ไม่อนุมัติ)-%3E%20แก้ไขเอกสาร%20-%3E%20หัวหน้าตรวจ&title=ขั้นตอนอนุมัติเอกสาร&dir=TB`
