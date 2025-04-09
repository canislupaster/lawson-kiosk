// shader for the background video (bg.mp4 in public)

#define PI 3.1415926538

//https://www.shadertoy.com/view/XljGzV
vec3 hsl2rgb( in vec3 c )
{
    vec3 rgb = clamp( abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0 );

    return c.z + c.y * (rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
}

float dist(vec2 uv) {
    vec2 start=uv;
    float c = sin(iTime)*0.2+1.0;
    for (int t=0; t<20; t++) {
        float rot = 6.0+float(t)/20.0;
        float a=sin(rot), b=cos(rot);
        uv = sin(uv*1.9+iTime*0.02) + 0.9*(b*vec2(-uv.y,uv.x) + uv*a);
    }
    
    float l = length(uv-start);
    return l/4.0;
}

float rand(vec2 co){
  return fract(sin(dot(mod(co.xy, vec2(15.228623, 19.3285)) ,vec2(12.9898,78.233))) * 43758.5453);
}

vec2 rand2(vec2 co){
  return vec2(rand(co), rand(co+vec2(3.2,5.6)));
}

const float HEX_W=0.1;

vec2 hex_center(vec2 uv) {
    float vertical = floor(uv.y/2.0/HEX_W);
    float off = vertical*HEX_W;
    float top=floor((uv.x+off)/2.0/HEX_W);
    float bottom = floor((uv.x+HEX_W+off)/2.0/HEX_W);
    
    vec2 c1 = vec2(top*2.0*HEX_W + HEX_W - off, vertical*2.0*HEX_W), c2=vec2(bottom*2.0*HEX_W - off, (vertical+1.0)*2.0*HEX_W);
    return dot(uv-c1, c2-c1) > dot(c2-c1,c2-c1)/2.0 ? c2 : c1;
}

float det(vec2 a, vec2 b) {
    return a.x*b.y - a.y*b.x;
}

float tri(vec2 uv, vec2 a, vec2 b, vec2 c) {
    vec2 db = b-a, dc=c-a, dx=uv-a, dbc = c-b;
    float d0 = det(db,dc), d1 = det(db,dx), d2=det(dx,dc), d3=det(dbc, uv-c);
    if (sign(d0)!=sign(d1) || sign(d0)!=sign(d2) || sign(d0)!=sign(d3)) return 100.0;
    return min(min( abs(d3)/length(dbc), abs(d1)/length(db) ), abs(d2)/length(dc) );
}

vec2 sample_hex(vec2 uv) {
    float x = HEX_W*(1.0-1.0/sqrt(3.0));
    float v = HEX_W - abs(uv.x)*x;
    return vec2(uv.x*HEX_W, uv.y*v)*0.5;
}

float color_edge(float dist, vec2 start, vec2 end) {
    dist*=200.0;
    dist*=dist;
    dist=max(0.0,1.0-dist);
    return dist*(rand(start)+rand(end))/2.0;
}

float height(vec2 uv, float t) {
    float a = rand(uv+3.0);
    return 0.2*(a*rand(uv) + (1.0-a)*rand(uv+3.0)*cos(0.2*rand(uv+8.0)*t));
}

vec2 rot(vec2 uv, float ang) {
    return cos(ang)*uv + sin(ang)*vec2(-uv.y,uv.x);
}

vec3 all_tri(vec2 uv, float seed, float t) {
    float scale = (0.2+0.007*t*t);
    float iscale = 1.0/scale;
    uv *= scale;
    uv=rot(uv, 0.05*t+0.01*uv.x+0.07*uv.y) + seed;
    
    vec2 h = hex_center(uv);
    vec2 hr = floor(h/HEX_W + 0.5);
    float[] dx= float[](-2.0,-1.0,1.0,2.0,1.0,-1.0,-2.0);
    float[] dy= float[](0.0,2.0,2.0,0.0,-2.0,-2.0,0.0);
    
    float coeff = t-3.0-length(uv);
    float off = 0.1*sin(coeff*0.3)-0.1;
    coeff = 5.0/(1.2 + 7.0*coeff*coeff) + clamp(coeff,0.0,1.0);
    
    vec2 cur = h+sample_hex(2.0*rand2(hr)-1.0);
    float h1=height(hr,t);
    
    for (int i=0; i<6; i++) {
        vec2 h2 = h + HEX_W*vec2(dx[i],dy[i]);
        vec2 h2r = hr + vec2(dx[i],dy[i]);
        
        vec2 h3 = h + HEX_W*vec2(dx[i+1],dy[i+1]);
        vec2 h3r = hr + vec2(dx[i+1],dy[i+1]);
        
        vec2 pos = h2+sample_hex(2.0*rand2(h2r)-1.0);
        vec2 pos2 = h3+sample_hex(2.0*rand2(h3r)-1.0);
        
        float d1 = det(pos2-cur, uv-cur), d2=det(uv-cur, pos-cur);
        if (d1>0.0 && d2>0.0) {
            float l1=d1/length(pos2-cur), l2=d2/length(pos-cur);
            float x = color_edge(l1*iscale, hr, h3r);
            float y = color_edge(l2*iscale, hr, h2r);
            
            float h3 = height(h3r,t);
            float h2 = height(h2r,t);
            
            float l3 = det(pos-pos2, uv-pos)/length(pos2-pos);

            float h = (l3*h1 + l2*h3 + l1*h2)/(l1+l2+l3);
            return vec3(2.0*coeff*mix(x, y, l1/(l1+l2)), 3.5*h+off, rand(hr+22.0));
        }
    }
    
    return vec3(0.0);
}

float fade2(float x) {
    x=fract(x);
    return 3.0*(1.0-x)*(1.0-x)*x;
}

const float fac = 20.0;
vec3 all_tri_levels(vec2 uv, float t) {
    vec3 o = vec3(0.0);
    
    float ai = floor(t), bi=mod(floor(t + 2.0/3.0),5.0), ci=mod(floor(t + 1.0/3.0),5.0);
    float aoff = rand(vec2(ai)), boff=rand(123.0+vec2(bi)), coff=rand(50.2+vec2(ci));
   
    o+=fade2(t)*all_tri(uv,aoff,fac*fract(t));
    o+=fade2(t+2.0/3.0)*all_tri(uv,boff,fac*fract(t+2.0/3.0));
    o+=fade2(t+1.0/3.0)*all_tri(uv,coff,fac*fract(t+1.0/3.0));
    return o;
}

float abstrace(vec3 camera_pos, vec3 ray, float time) {
    float t=0.1;
    camera_pos.z = all_tri_levels(camera_pos.xy, time).y;
    for (int iter=0; iter<50; iter++) {
        vec3 p = camera_pos + ray*t;
        
        float y = all_tri_levels(p.xy, time).y;
  
        if (y>p.z) {
            return 1.0;
            break;
        }
        
        t+=0.005;
    }
    
    return 0.0;
}

vec2 trace(vec3 camera_pos, vec3 ray, float time) {
    float t=0.01;
    float glow=0.0;
    for (int iter=0; iter<200; iter++) {
        vec3 p = camera_pos + ray*t;
        vec3 res = all_tri_levels(p.xy, time);
        
        glow+=0.2*res.x/(0.5+90.0*(res.y-p.z)*(res.y-p.z));
        
        if (abs(res.y-p.z)<0.0004) {
            break;
        }
        
        t+=clamp((p.z-res.y)*0.3, 0.0003, 0.3);
    }
    
    return vec2(t,glow);
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    float oTime = float(iFrame)/30.0;
    vec2 uv = rot(2.0*fragCoord/800.0-1.0, 0.2);
    //vec2 mouse = PI*vec2(2.0,0.3)*iMouse.xy/iResolution.xy;
    vec2 mouse = vec2(-oTime*0.06*PI,0.09*PI);
    float a=mouse.x+PI*0.2, b=mouse.y+0.1*PI;
    vec3 orbit = vec3(cos(a)*cos(b),sin(a)*cos(b), sin(b));
    vec3 camera_pos = 3.0*orbit+vec3(0.0,0.0,0.3);
    vec3 camera_up = vec3(-cos(a)*sin(b),-sin(a)*sin(b), cos(b));
    
    vec3 camera_left = normalize(cross(camera_pos,camera_up));
    vec3 ray = asin(70.0/360.0)*(camera_up*uv.y - camera_left*uv.x) - orbit;
    
    float time = oTime/fac;
    
    vec2 ret = trace(camera_pos, ray, time);
    float t = ret.x;
    
    if (t>20.0) {
        fragColor=vec4(0.0);
        return;
    }
    
    vec3 p = camera_pos + ray*t;
    vec3 res=all_tri_levels(p.xy, time);
    float fade_far = 1.0/(0.1 + 0.05*dot(camera_pos-p, camera_pos-p));
    float fade_far_linear = 1.0/(0.3 + 0.3*length(camera_pos-p));
    float glow=ret.y*fade_far;
    
    const float h = 0.00001;
    float[] dx = float[](-1.0,0.0,1.0,0.0,-2.0,2.0,0.0,0.0);
    float[] dy = float[](0.0,1.0,0.0,-1.0,0.0,0.0,-2.0,2.0);

    vec3 normal=vec3(0.0);
    for (int i=0; i<8; i++) {
        float he = all_tri_levels(p.xy+vec2(dx[i],dy[i])*h, time).y-res.y;
        normal+=vec3(-dx[i]*he, -dy[i]*he, h);
    }
    
    normal=normalize(normal);
        
    vec3 light = normalize(vec3(rot(vec2(-0.1,-0.3), oTime*0.08*PI),-0.5));
    vec3 spec_light = vec3(rot(light.xy, 2.0), 1.0);
    
    float f = cos(dot(normal, normalize(camera_pos-p)));
    f*=f*f*f*f;
    
    float d =dot(normal, normalize(spec_light-p));
    float lighting = (0.9+0.6*f)*(0.8*dot(normal,-light) - d*d*d*0.9)*clamp(fade_far_linear,0.3,0.9);
    
    /*float shadow = 0.0;
    for (float t=0.0001; t<0.01; t+=0.0005) {
        if (all_tri_levels(p.xy - light.xy*t, time).y > res.y - light.z*t*0.9)
            shadow+=1.0;
    }*/
    
    glow = clamp(0.3*glow + lighting*lighting, 0.0, 1.0);//*(1.0-1.0/(10.0+shadow));
    glow*=glow;
    
    fragColor=vec4(pow( hsl2rgb(vec3(oTime*0.02 + glow*0.1 + 0.2*res.z, min(0.2+glow*0.8,0.7), glow)), vec3(0.4545)), 1.0);
}

