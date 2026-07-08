// Mock assistant messages for the Chat Lab. Each fixture is a plain markdown
// string with one feature baked in, so content can change without touching the
// streaming engine or the rendering variants. `mixed` and `broken-mermaid`
// exist to exercise the harder paths (multiple features at once, and the
// mermaid errorComponent) that production content occasionally hits.

export interface ChatFixture {
  id: string;
  label: string;
  description: string;
  text: string;
  /** Thinking trace streamed before the answer when Reasoning is toggled on. */
  reasoning: string;
}

// One shared trace is enough — the lab is testing the reasoning *panel*
// (open/stream/collapse behavior), not trace content per fixture.
const SHARED_REASONING = `The user is asking about the training loop, so I should lead with the feedback-loop framing rather than architecture details.

Let me check what level to pitch this at. They've seen gradient descent notation before, so I can use it without re-deriving it — but I should keep the emphasis on the practical loop: ship, observe failures, tighten the train/serve gap.

I'll structure the answer as a short claim, then the supporting specifics, and close with the one-line takeaway. Keeping it tight — no need for a full curriculum here.`;

export const CHAT_FIXTURES: ChatFixture[] = [
  {
    id: "plain",
    label: "Plain prose",
    description: "Paragraphs, emphasis, and a short list — the common case.",
    reasoning: SHARED_REASONING,
    text: `Training a model is mostly about **feedback loops**, not architecture.

You ship a small version, watch where it fails, and tighten the gap between what it saw in training and what it meets in the real world. A few things that matter early:

- Keep the eval set _separate_ from anything the model trained on.
- Measure the metric your users feel, not the one that's easy to log.
- Prefer boring, reproducible pipelines over clever one-off scripts.

Once the loop is tight, everything else is tuning.`,
  },
  {
    id: "latex",
    label: "LaTeX heavy",
    description: "Inline and display math to exercise the KaTeX plugin.",
    reasoning: SHARED_REASONING,
    text: `The gradient update is just a weighted step against the loss surface.

For a parameter $\\theta$ with learning rate $\\eta$, one step of gradient descent is:

$$\\theta_{t+1} = \\theta_t - \\eta \\, \\nabla_\\theta \\mathcal{L}(\\theta_t)$$

The loss itself, for a batch of $N$ examples, is the mean cross-entropy:

$$\\mathcal{L} = -\\frac{1}{N} \\sum_{i=1}^{N} \\sum_{c} y_{i,c} \\log \\hat{y}_{i,c}$$

When $\\eta$ is too large the step overshoots the minimum; when it's too small, convergence crawls.`,
  },
  {
    id: "mermaid",
    label: "Mermaid flow",
    description: "A fenced mermaid diagram rendered to SVG on close.",
    reasoning: SHARED_REASONING,
    text: `Here's the training loop as a flow — note the diagram only paints once its closing fence streams in.

\`\`\`mermaid
flowchart TD
  A[Collect data] --> B[Train model]
  B --> C{Eval passes?}
  C -->|No| D[Inspect failures]
  D --> A
  C -->|Yes| E[Ship + monitor]
  E --> F[Drift detected] --> A
\`\`\`

The cycle never really ends — shipping just starts the next iteration.`,
  },
  {
    id: "code-list",
    label: "Code + list",
    description: "A fenced code block, a table, and nested lists.",
    reasoning: SHARED_REASONING,
    text: `A minimal training step in PyTorch looks like this:

\`\`\`python
for batch in loader:
    optimizer.zero_grad()
    loss = criterion(model(batch.x), batch.y)
    loss.backward()
    optimizer.step()
\`\`\`

The three knobs you'll reach for first:

| Knob          | Typical range | Effect                         |
| ------------- | ------------- | ------------------------------ |
| Learning rate | 1e-5 – 1e-3   | Step size along the gradient   |
| Batch size    | 8 – 512       | Gradient noise vs. throughput  |
| Weight decay  | 0 – 0.1       | Regularization pressure        |

Tune them one at a time — changing two at once hides which one mattered.`,
  },
  {
    id: "mixed",
    label: "Mixed (all)",
    description: "Prose, math, a code block, and a mermaid diagram together.",
    reasoning: SHARED_REASONING,
    text: `Let's connect the pieces. The model learns by minimizing loss $\\mathcal{L}$ over its parameters, updated each step as $\\theta \\leftarrow \\theta - \\eta \\nabla \\mathcal{L}$.

In code that's a single call:

\`\`\`python
loss.backward()
optimizer.step()
\`\`\`

And the whole system, end to end:

\`\`\`mermaid
sequenceDiagram
  participant U as User
  participant M as Model
  participant E as Eval
  U->>M: prompt
  M->>U: streamed response
  U->>E: feedback signal
  E->>M: gradient update
\`\`\`

Every feedback signal nudges $\\theta$ a little closer to what users actually want.`,
  },
  {
    id: "broken-mermaid",
    label: "Broken mermaid",
    description: "Malformed diagram — exercises the mermaid errorComponent.",
    reasoning: SHARED_REASONING,
    text: `This diagram is intentionally malformed to test the error fallback:

\`\`\`mermaid
flowchart TD
  A[Start --> B]] this is not valid ((( syntax
  --> ??? -->
\`\`\`

The renderer should show a graceful fallback instead of crashing.`,
  },
];
