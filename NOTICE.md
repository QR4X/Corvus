# Third-party notices

Corvus is licensed under the GNU General Public License v3.0 or later (see
[LICENSE](LICENSE)). It bundles the material below, which carries its own terms.

The bundled MIT-licensed material stays under MIT — GPL-3.0 is compatible with
it, and this notice is what carries its copyright line into the distribution.

## Provider and model-maker logos

The SVG logos of the AI providers and model makers shown in the model picker,
the chat composer and the usage screens come from
**[lobe-icons](https://github.com/lobehub/lobe-icons)**, MIT licensed.

They are normalized into the Obsidian icon space by `scripts/genLogos.mjs` and
**shipped inlined in `main.js`** — the `assets/svg/` folder is not distributed,
but its content is. This notice travels with the plugin for that reason.

```
MIT License

Copyright (c) 2023 LobeHub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Trademarks

The logos are trademarks of their respective owners — OpenAI, Anthropic,
Google, NVIDIA, Ollama, OpenRouter, Meta, DeepSeek, Mistral AI, Alibaba
(Qwen), Z.ai, ByteDance, Black Forest Labs and Stability AI.

They are used here **only to identify which provider or model maker a given
model belongs to**, so a list of model names is scannable by eye. No
affiliation, sponsorship or endorsement is claimed or implied, and none of
these companies is involved with this plugin.

## Model popularity baseline

`src/providers/hotData.generated.ts` holds a popularity baseline regenerated
weekly by `scripts/collect-hot.mjs` from public **Hugging Face** download
counts for open models, plus a hand-curated figure for closed ones. It is
plain numeric data, computed locally, and no telemetry of any kind is sent
from the plugin.

## Icons

The rest of the interface uses **Lucide** icons through Obsidian's own
`setIcon()` API. They ship with Obsidian, not with this plugin.
