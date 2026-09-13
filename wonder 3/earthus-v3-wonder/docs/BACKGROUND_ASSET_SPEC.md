# Background Asset Spec

All backgrounds are lightweight WebP and are loaded by region/environment, never all at first paint.

Suggested runtime layers:
1. base paper environment
2. one main ambient motion
3. one or two secondary motions
4. discovery hit areas
5. character layer

Do not turn every background into a continuous video. Use CSS/WebGL transforms and small event animations.
