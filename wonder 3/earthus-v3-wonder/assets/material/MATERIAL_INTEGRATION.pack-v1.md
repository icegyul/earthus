# Paper Earth Material — Runtime Integration

이 폴더는 시안 이미지가 아니라 Globe Renderer에 직접 적용하는 실제 Material Pack이다.

## Geometry/Data

지리 경계는 별도 데이터가 담당한다.
이 Material Pack은 지리 정보를 baked 하지 않는다.

## Shader Layer

1. Ocean base material
2. Land biome material
3. Fiber overlay
4. Height/normal
5. Matte roughness
6. Coast cut-edge
7. Paper thickness shadow
8. Soft edge highlight

## Visual Target

"paper texture를 입힌 지구"가 아니라
"여러 겹의 종이를 잘라 만든 구형 지구"

## Performance

2048 material은 필요 시 half-res로 내려갈 수 있다.
Material textures는 shared/immutable cache를 사용하고, 지역 콘텐츠와 캐릭터는 별도 lazy-load한다.
