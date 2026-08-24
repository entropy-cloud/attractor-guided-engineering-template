import{q as n,a4 as u,s as l,v as y,d as T,o as s,b,L as B,g as d,a as x,I as q,bd as X,w as L,y as K,m as G,be as J,h as S,e as w,V as Q,ah as _,j as Z,C as z,bf as H,i as ee,l as te,p,D as k,bg as oe,bh as re,t as M,E as le,bi as ne}from"./index-Bs0T058a.js";import{C as se,u as ae}from"./index-BmUjc2zd.js";var ie=n("layout-sider",`
 flex-shrink: 0;
 box-sizing: border-box;
 position: relative;
 z-index: 1;
 color: var(--n-text-color);
 transition:
 color .3s var(--n-bezier),
 border-color .3s var(--n-bezier),
 min-width .3s var(--n-bezier),
 max-width .3s var(--n-bezier),
 transform .3s var(--n-bezier),
 background-color .3s var(--n-bezier);
 background-color: var(--n-color);
 display: flex;
 justify-content: flex-end;
`,[u("bordered",[l("border",`
 content: "";
 position: absolute;
 top: 0;
 bottom: 0;
 width: 1px;
 background-color: var(--n-border-color);
 transition: background-color .3s var(--n-bezier);
 `)]),l("left-placement",[u("bordered",[l("border",`
 right: 0;
 `)])]),u("right-placement",`
 justify-content: flex-start;
 `,[u("bordered",[l("border",`
 left: 0;
 `)]),u("collapsed",[n("layout-toggle-button",[n("base-icon",`
 transform: rotate(180deg);
 `)]),n("layout-toggle-bar",[y("&:hover",[l("top",{transform:"rotate(-12deg) scale(1.15) translateY(-2px)"}),l("bottom",{transform:"rotate(12deg) scale(1.15) translateY(2px)"})])])]),n("layout-toggle-button",`
 left: 0;
 transform: translateX(-50%) translateY(-50%);
 `,[n("base-icon",`
 transform: rotate(0);
 `)]),n("layout-toggle-bar",`
 left: -28px;
 transform: rotate(180deg);
 `,[y("&:hover",[l("top",{transform:"rotate(12deg) scale(1.15) translateY(-2px)"}),l("bottom",{transform:"rotate(-12deg) scale(1.15) translateY(2px)"})])])]),u("collapsed",[n("layout-toggle-bar",[y("&:hover",[l("top",{transform:"rotate(-12deg) scale(1.15) translateY(-2px)"}),l("bottom",{transform:"rotate(12deg) scale(1.15) translateY(2px)"})])]),n("layout-toggle-button",[n("base-icon",`
 transform: rotate(0);
 `)])]),n("layout-toggle-button",`
 transition:
 color .3s var(--n-bezier),
 right .3s var(--n-bezier),
 left .3s var(--n-bezier),
 border-color .3s var(--n-bezier),
 background-color .3s var(--n-bezier);
 cursor: pointer;
 width: 24px;
 height: 24px;
 position: absolute;
 top: 50%;
 right: 0;
 border-radius: 50%;
 display: flex;
 align-items: center;
 justify-content: center;
 font-size: 18px;
 color: var(--n-toggle-button-icon-color);
 border: var(--n-toggle-button-border);
 background-color: var(--n-toggle-button-color);
 box-shadow: 0 2px 4px 0px rgba(0, 0, 0, .06);
 transform: translateX(50%) translateY(-50%);
 z-index: 1;
 `,[n("base-icon",`
 transition: transform .3s var(--n-bezier);
 transform: rotate(180deg);
 `)]),n("layout-toggle-bar",`
 cursor: pointer;
 height: 72px;
 width: 32px;
 position: absolute;
 top: calc(50% - 36px);
 right: -28px;
 `,[l("top, bottom",`
 position: absolute;
 width: 4px;
 border-radius: 2px;
 height: 38px;
 left: 14px;
 transition: 
 background-color .3s var(--n-bezier),
 transform .3s var(--n-bezier);
 `),l("bottom",`
 position: absolute;
 top: 34px;
 `),y("&:hover",[l("top",{transform:"rotate(12deg) scale(1.15) translateY(-2px)"}),l("bottom",{transform:"rotate(-12deg) scale(1.15) translateY(2px)"})]),l("top, bottom",{backgroundColor:"var(--n-toggle-bar-color)"}),y("&:hover",[l("top, bottom",{backgroundColor:"var(--n-toggle-bar-color-hover)"})])]),l("border",`
 position: absolute;
 top: 0;
 right: 0;
 bottom: 0;
 width: 1px;
 transition: background-color .3s var(--n-bezier);
 `),n("layout-sider-scroll-container",`
 flex-grow: 1;
 flex-shrink: 0;
 box-sizing: border-box;
 height: 100%;
 opacity: 0;
 transition: opacity .3s var(--n-bezier);
 max-width: 100%;
 `),u("show-content",[n("layout-sider-scroll-container",{opacity:1})]),u("absolute-positioned",`
 position: absolute;
 left: 0;
 top: 0;
 bottom: 0;
 `)]);const ce=["onClick"];var de=T({props:{clsPrefix:{type:String,required:!0},onClick:Function},render(){const{clsPrefix:e}=this;return s(),b("div",{onClick:this.onClick,class:d(`${e}-layout-toggle-bar`)},[B("div",{class:d(`${e}-layout-toggle-bar__top`)},null,2),B("div",{class:d(`${e}-layout-toggle-bar__bottom`)},null,2)],10,ce)}});const ge=["onClick"];var ue=T({name:"LayoutToggleButton",props:{clsPrefix:{type:String,required:!0},onClick:Function},render(){const{clsPrefix:e}=this;return s(),b("div",{class:d(`${e}-layout-toggle-button`),onClick:this.onClick},[(s(),x(q,{clsPrefix:e},{default:()=>(s(),x(se))},1032,["clsPrefix"]))],10,ge)}});const be=["onTransitionend"],he={position:X,bordered:Boolean,collapsedWidth:{type:Number,default:48},width:{type:[Number,String],default:272},contentClass:String,contentStyle:{type:[String,Object],default:""},collapseMode:{type:String,default:"transform"},collapsed:{type:Boolean,default:void 0},defaultCollapsed:Boolean,showCollapsedContent:{type:Boolean,default:!0},showTrigger:{type:[Boolean,String],default:!1},nativeScrollbar:{type:Boolean,default:!0},inverted:Boolean,scrollbarProps:Object,triggerClass:String,triggerStyle:[String,Object],collapsedTriggerClass:String,collapsedTriggerStyle:[String,Object],"onUpdate:collapsed":[Function,Array],onUpdateCollapsed:[Function,Array],onAfterEnter:Function,onAfterLeave:Function,onExpand:[Function,Array],onCollapse:[Function,Array],onScroll:Function};var ye=T({name:"LayoutSider",props:{...L.props,...he},setup(e){const a=Z(re),c=z(null),m=z(null),v=z(e.defaultCollapsed),g=ae(M(e,"collapsed"),v),Y=p(()=>_(g.value?e.collapsedWidth:e.width)),F=p(()=>e.collapseMode!=="transform"?{}:{minWidth:_(e.width)}),O=p(()=>a?a.siderPlacement:"left");function A(o,t){if(e.nativeScrollbar){const{value:r}=c;r&&(t===void 0?r.scrollTo(o):r.scrollTo(o,t))}else{const{value:r}=m;r&&r.scrollTo(o,t)}}function N(){const{"onUpdate:collapsed":o,onUpdateCollapsed:t,onExpand:r,onCollapse:C}=e,{value:f}=g;t&&k(t,!f),o&&k(o,!f),v.value=!f,f?r&&k(r):C&&k(C)}let P=0,R=0;const V=o=>{var r;const t=o.target;P=t.scrollLeft,R=t.scrollTop,(r=e.onScroll)==null||r.call(e,o)};H(()=>{if(e.nativeScrollbar){const o=c.value;o&&(o.scrollTop=R,o.scrollLeft=P)}}),le(ne,{collapsedRef:g,collapseModeRef:M(e,"collapseMode")});const{mergedClsPrefixRef:$,inlineThemeDisabled:I}=ee(e),E=L("Layout","-layout-sider",ie,oe,e,$);function W(o){var t,r;o.propertyName==="max-width"&&(g.value?(t=e.onAfterLeave)==null||t.call(e):(r=e.onAfterEnter)==null||r.call(e))}const D={scrollTo:A},j=p(()=>{const{common:{cubicBezierEaseInOut:o},self:t}=E.value,{siderToggleButtonColor:r,siderToggleButtonBorder:C,siderToggleBarColor:f,siderToggleBarColorHover:U}=t,i={"--n-bezier":o,"--n-toggle-button-color":r,"--n-toggle-button-border":C,"--n-toggle-bar-color":f,"--n-toggle-bar-color-hover":U};return e.inverted?(i["--n-color"]=t.siderColorInverted,i["--n-text-color"]=t.textColorInverted,i["--n-border-color"]=t.siderBorderColorInverted,i["--n-toggle-button-icon-color"]=t.siderToggleButtonIconColorInverted,i.__invertScrollbar=t.__invertScrollbar):(i["--n-color"]=t.siderColor,i["--n-text-color"]=t.textColor,i["--n-border-color"]=t.siderBorderColor,i["--n-toggle-button-icon-color"]=t.siderToggleButtonIconColor),i}),h=I?te("layout-sider",p(()=>e.inverted?"a":"b"),j,e):void 0;return{scrollableElRef:c,scrollbarInstRef:m,mergedClsPrefix:$,mergedTheme:E,styleMaxWidth:Y,mergedCollapsed:g,scrollContainerStyle:F,siderPlacement:O,handleNativeElScroll:V,handleTransitionend:W,handleTriggerClick:N,inlineThemeDisabled:I,cssVars:j,themeClass:h==null?void 0:h.themeClass,onRender:h==null?void 0:h.onRender,...D}},render(){var m;const{mergedClsPrefix:e,mergedCollapsed:a,showTrigger:c}=this;return(m=this.onRender)==null||m.call(this),s(),b("aside",{class:d([`${e}-layout-sider`,this.themeClass,`${e}-layout-sider--${this.position}-positioned`,`${e}-layout-sider--${this.siderPlacement}-placement`,this.bordered&&`${e}-layout-sider--bordered`,a&&`${e}-layout-sider--collapsed`,(!a||this.showCollapsedContent)&&`${e}-layout-sider--show-content`]),onTransitionend:this.handleTransitionend,style:S([this.inlineThemeDisabled?void 0:this.cssVars,{maxWidth:this.styleMaxWidth,width:_(this.width)}])},[this.nativeScrollbar?(s(),b("div",{key:1,class:d([`${e}-layout-sider-scroll-container`,this.contentClass]),onScroll:this.handleNativeElScroll,style:S([this.scrollContainerStyle,{overflow:"auto"},this.contentStyle]),ref:"scrollableElRef"},[w(()=>{var v,g;return(g=(v=this.$slots).default)==null?void 0:g.call(v)})],46,["onScroll"])):(s(),x(J,G({key:0},this.scrollbarProps,{onScroll:this.onScroll,ref:"scrollbarInstRef",style:this.scrollContainerStyle,contentStyle:this.contentStyle,contentClass:this.contentClass,theme:this.mergedTheme.peers.Scrollbar,themeOverrides:this.mergedTheme.peerOverrides.Scrollbar,builtinThemeOverrides:this.inverted&&this.cssVars.__invertScrollbar==="true"?{colorHover:"rgba(255, 255, 255, .4)",color:"rgba(255, 255, 255, .3)"}:void 0}),K(this.$slots),1040,["onScroll","style","contentStyle","contentClass","theme","themeOverrides","builtinThemeOverrides"])),c?(s(),b(Q,{key:2},[c==="bar"?(s(),x(de,{key:0,clsPrefix:e,class:d(a?this.collapsedTriggerClass:this.triggerClass),style:S(a?this.collapsedTriggerStyle:this.triggerStyle),onClick:this.handleTriggerClick},null,8,["clsPrefix","class","style","onClick"])):(s(),x(ue,{key:1,clsPrefix:e,class:d(a?this.collapsedTriggerClass:this.triggerClass),style:S(a?this.collapsedTriggerStyle:this.triggerStyle),onClick:this.handleTriggerClick},null,8,["clsPrefix","class","style","onClick"]))],64)):w(()=>null),this.bordered?(s(),b("div",{key:4,class:d(`${e}-layout-sider__border`)},null,2)):w(()=>null)],46,be)}});const fe={xmlns:"http://www.w3.org/2000/svg","xmlns:xlink":"http://www.w3.org/1999/xlink",viewBox:"0 0 512 512"},pe=T({name:"ChevronDown",render:function(a,c){return s(),b("svg",fe,c[0]||(c[0]=[B("path",{fill:"none",stroke:"currentColor","stroke-linecap":"round","stroke-linejoin":"round","stroke-width":"48",d:"M112 184l144 144l144-144"},null,-1)]))}});export{pe as C,ye as L};
