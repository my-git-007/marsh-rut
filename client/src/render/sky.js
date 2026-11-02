// render/sky.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { C, FOG_COL, SUN_COL, SUN_DIR, U, scene } from './core.js';

/* ================= sky ================= */
const NOISE_GLSL = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.0,a=0.5;for(int i=0;i<5;i++){s+=a*vnoise(p);p=p*2.03+vec2(1.7,9.2);a*=0.5;}return s;}`;
function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: SUN_DIR },
      uZen: { value: C('#47729f') },
      uHor: { value: FOG_COL },
      uSunCol: { value: SUN_COL },
      uTime: U.time,
    },
    vertexShader: `varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform vec3 uSun,uZen,uHor,uSunCol;uniform float uTime;varying vec3 vDir;${NOISE_GLSL}
    void main(){vec3 d=normalize(vDir);float h=d.y;
      vec3 col=mix(uHor,uZen,pow(clamp(h,0.0,1.0),0.48));
      col=mix(col,uHor*0.93,smoothstep(0.0,-0.08,h));
      float sd=max(dot(d,uSun),0.0);
      col+=uSunCol*(pow(sd,5.0)*0.22+pow(sd,40.0)*0.55);
      if(h>0.0){vec2 uv=d.xz/(h+0.1)*1.3+vec2(uTime*0.004,uTime*0.0015);
        float n=fbm(uv*1.1);float n2=fbm(uv*1.1+uSun.xz*0.06);
        float c=smoothstep(0.5,0.78,n)*smoothstep(0.0,0.22,h);
        vec3 cc=mix(vec3(0.42,0.44,0.5),vec3(1.2,1.1,0.98),clamp(0.55+(n-n2)*5.0,0.0,1.0));cc+=uSunCol*pow(sd,6.0)*0.7;
        float ci=smoothstep(0.55,0.88,fbm(vec2(uv.x*0.35,uv.y*2.6)+3.0))*0.35*smoothstep(0.04,0.4,h);
        col=mix(col,cc,c*0.88);col=mix(col,vec3(1.05,1.0,0.96),ci);}
      col+=uSunCol*smoothstep(0.99985,0.99994,sd)*40.0;
      gl_FragColor=vec4(col,1.0);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  scene.add(m);
  return m;
}

export { NOISE_GLSL, buildSky };
