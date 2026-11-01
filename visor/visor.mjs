import {vacio, filtrar, csv, porcentaje, puntos, paginar, estados_visibles, resumen_hover, escalar_vista, encuadrar_vista, contexto_entrada, recomendar, validar_recomendaciones, ruta_recomendaciones, etiqueta_escenario, cobertura, etiqueta_entidad, grupos_escenarios, partir_etiqueta, composicion_ln} from './logica.mjs';
import {validar_producto, filas_consulta} from './producto.mjs';

const $ = id => document.getElementById(id);
const ns = 'http://www.w3.org/2000/svg';
const filtros_ids = ['entidad','buscar','nivel-s0','nivel','orientacion','calidad','disponibilidad','enlace','antecedente'];
const avanzados_ids = filtros_ids.slice(2);
let datos, mapa, manifiesto, filas=[], visibles=[], pagina=0, cart_pagina=0, seleccion=null, vista;
const paths = [new Map(), new Map()];
let por_feature, estados, nombres_entidad=new Map();
const etiquetas = {bajo:'Bajo', medio:'Medio', alto:'Alto', sin_estimacion:'Sin estimación', sin_separacion:'Sin separación', calculable:'Con tasa', sin_tasa:'Sin tasa', solo_tabular:'Sólo tabular', enlace_sustentado:'Enlace sustentado', sin_enlace_sustentado:'Sin enlace sustentado', sin_origen_2021:'Sin origen 2021', verificar_datos:'Verificar datos', revisar_calidad:'Revisar calidad antes de priorizar', revisar_soporte:'Revisar soporte del modelo', diagnostico_sin_antecedente:'Diagnóstico sin antecedente', diagnostico_sin_separacion:'Diagnóstico sin separación', explorar_piloto:'Explorar piloto condicionado', informacion_y_diagnostico:'Información y diagnóstico', conteos_especificados_completos:'Conteos sin NS registrados', revisar_ns:'Revisar participación no especificada', revisar_fuente:'Revisar la fuente', sin_conteos_completos:'Conteos incompletos', sin_denominador_especificado:'Sin denominador especificado'};
const variables = {origen_tasa_abstencion:'abstención previa', origen_ln:'lista nominal', origen_proporcion_ns:'NS/LN', origen_edad_18_29:'edad 18–29', origen_edad_30_44:'edad 30–44', origen_edad_45_59:'edad 45–59', origen_sexo_hombres:'proporción de hombres'};
const texto = valor => vacio(valor) ? 'No aplica' : (etiquetas[valor] || String(valor).replaceAll('_',' '));
function nodo(tipo, contenido) { const n=document.createElement(tipo); if (contenido !== undefined) n.textContent=contenido; return n; }
function filtros() { return Object.fromEntries(filtros_ids.map(id=>[id==='nivel-s0'?'nivel_s0':id,$(id).value])); }
const entero = valor => vacio(valor)?'Sin dato':Number(valor).toLocaleString('es-MX');
function referencia() {
    if(datos.naturaleza==='s0_sociodemografico') return 'S0 estima la abstención de 2027 con un modelo basado en historia electoral y sociodemografía de 2021.';
    if(datos.naturaleza==='sintetica') return 'S0 es una referencia sintética: datos y polígonos ficticios, sin valor predictivo.';
    return 'S0 conserva la abstención observada en 2021 como referencia histórica para comparar los escenarios.';
}
function resumen_cobertura(destino, unidades) {
    const c=cobertura(unidades), tabla=nodo('table'), cabecera=nodo('thead'), fila=nodo('tr');
    for(const titulo of ['Disponibilidad','Municipios','LN 2021','% de LN']) {const th=nodo('th',titulo);th.scope='col';fila.append(th);}
    cabecera.append(fila);tabla.append(cabecera);const cuerpo=nodo('tbody');
    for(const [clave,nombre] of [['con_tasa_enlace','Con tasa y enlace'],['con_tasa_solo_tabular','Con tasa, sólo tabulares'],['sin_tasa','Sin tasa']]) {
        const grupo=c.grupos[clave], tr=nodo('tr');
        tr.append(nodo('th',nombre),nodo('td',entero(grupo.municipios)),nodo('td',entero(grupo.ln)),nodo('td',grupo.porcentaje_ln===null?'No calculable':porcentaje(grupo.porcentaje_ln)));
        tr.firstChild.scope='row';cuerpo.append(tr);
    }
    tabla.append(cuerpo);$(destino).replaceChildren(nodo('p',`${entero(c.municipios)} municipios · LN 2021: ${entero(c.ln_total)}${c.ln_faltante?` · ${entero(c.ln_faltante)} unidades sin LN`:''}`),tabla);
    if(!c.municipios)$(destino).append(nodo('p','Sin municipios para estos filtros. Usa «Limpiar filtros» para recuperar el universo.'));
}
function describir_escenario(escenario) {
    const d=Math.abs(escenario.delta_pp), ejemplo=`por ejemplo, 48 % pasa a ${48-escenario.delta_pp} %`;
    const sensibilidad=['S0','S1'].includes(escenario.id)?'':' Es una opción de sensibilidad.';
    if(escenario.delta_pp===0) return 'ambos mapas muestran la referencia S0. Elige S1 para compararla con el escenario central.';
    if(escenario.delta_pp>0) return `el mapa derecho resta ${d} puntos porcentuales a S0 en cada municipio con tasa (${ejemplo}). Es un supuesto uniforme para comparar.${sensibilidad}`;
    return `el mapa derecho suma ${d} puntos porcentuales a S0 en cada municipio con tasa (${ejemplo}). Es un escenario adverso de sensibilidad.`;
}
function describir_filtros() {
    const nombres={'entidad':'Entidad','buscar':'Búsqueda','nivel-s0':'Nivel S0','nivel':'Nivel del escenario','orientacion':'Orientación','calidad':'Calidad','disponibilidad':'Disponibilidad','enlace':'Enlace','antecedente':'Evaluación histórica'};
    return filtros_ids.filter(id=>$(id).value).map(id=>`${nombres[id]}: ${id==='buscar'?`«${$(id).value}»`:$(id).selectedOptions[0].textContent}`).join('; ') || 'sin filtros';
}
function fila_detalle(titulo, campos) {
    $('detalle').replaceChildren(nodo('h2',titulo));
    $('detalle').append(lista_datos(campos));
    boton_cerrar();
}
function lista_datos(campos, clase='datos') {
    const dl=nodo('dl');dl.className=clase;
    for(const [nombre,valor] of campos) {const grupo=nodo('div');grupo.append(nodo('dt',nombre),nodo('dd',valor));dl.append(grupo);}
    return dl;
}
function boton_cerrar() {
    const cerrar=nodo('button','Cerrar detalle');
    cerrar.className='cerrar-detalle exclusivo-mapa';
    cerrar.onclick=()=>{document.body.classList.remove('detalle-abierto');$('municipio').focus();};
    $('detalle').append(cerrar);
}
function chip(contenido, clase='') { const s=nodo('span',contenido);s.className=`chip ${clase}`.trim();return s; }
function nivel(valor) { const s=nodo('span');s.className='nivel';const i=nodo('i');i.className=valor;s.append(i,texto(valor));return s; }
function bloque(titulo, ...contenido) { const s=nodo('section');s.className='bloque';s.append(nodo('h3',titulo),...contenido);return s; }
function cifra(etiqueta, valor, pie) {
    const d=nodo('div');d.className='cifra';d.append(nodo('span',etiqueta),nodo('strong',valor));
    if(pie)d.append(pie);
    return d;
}
function propuesta(unidad) {
    if(unidad.ruta_revision) return unidad;
    return recomendar(unidad,datos.recomendaciones,datos.naturaleza,
        manifiesto?.codigo_sha256?.[ruta_recomendaciones(datos.recomendaciones)] || '');
}
function bloque_propuesta(unidad) {
    const r=propuesta(unidad), ruta=nodo('p');ruta.className='ruta';
    ruta.append(chip(texto(r.ruta_revision),`ruta-${r.ruta_revision}`),nodo('span',r.estado_estimacion==='sin_estimacion'?'Basada en la ausencia de tasa y en la calidad de los datos de 2021.':`Basada en el nivel S0 (${texto(r.nivel_s0)}) y en la calidad de los datos de 2021.`));
    const condicion=nodo('p',r.condicion_uso);condicion.className='condicion';
    const s=bloque('Qué hacer con este resultado',ruta,nodo('p',r.accion_propuesta),condicion);
    // Las alertas repetidas en otras secciones (calidad, LN y NS) no se duplican aquí.
    const avisos=String(r.alertas||'').split(' | ').filter(a=>a&&a!==r.motivo_calidad_orientacion&&!a.startsWith('LN de origen 2021:'));
    if(!vacio(r.variables_fuera_soporte)) avisos.push(`Variables fuera del rango de entrenamiento: ${String(r.variables_fuera_soporte).split(/[;,|]\s*/).map(v=>variables[v]||v).join(', ')}.`);
    if(avisos.length) {const ul=nodo('ul');ul.className='avisos';for(const a of avisos)ul.append(nodo('li',a));s.append(ul);}
    return s;
}
function bloque_origen(f) {
    const s=bloque('Datos de origen 2021'), c=composicion_ln(f);
    if(c) {
        const barra=nodo('div');barra.className='barra-ln';barra.setAttribute('role','img');
        barra.setAttribute('aria-label',`Lista nominal 2021: ${c.partes.map(p=>`${p.nombre} ${porcentaje(p.proporcion)}`).join(', ')}`);
        for(const p of c.partes) {const seg=nodo('span');seg.className=p.clave;seg.style.width=`${p.proporcion*100}%`;barra.append(seg);}
        const leyenda=nodo('dl');leyenda.className='conteos';
        const total=nodo('div');total.append(nodo('dt','Lista nominal (LN)'),nodo('dd',entero(c.ln)));leyenda.append(total);
        for(const p of c.partes) {
            const g=nodo('div'),dt=nodo('dt'),i=nodo('i');i.className=p.clave;dt.append(i,p.nombre);
            const dd=nodo('dd',entero(p.valor));dd.append(nodo('small',porcentaje(p.proporcion)));g.append(dt,dd);leyenda.append(g);
        }
        s.append(barra,leyenda);
    } else s.append(nodo('p',`Conteos de 2021 incompletos para esta unidad. NS / LN: ${porcentaje(f.proporcion_ns_2021)}.`));
    const especificados=f.denominador_especificado??(Number(f.sv_2021)+Number(f.nv_2021));
    const fraccion=f.fraccion_especificada??(Number(f.ln_2021)>0?especificados/Number(f.ln_2021):'');
    const casos=nodo('p');casos.className='casos';
    casos.append(nodo('strong','Casos especificados (SV + NV): '),`${entero(especificados)}, ${porcentaje(fraccion)} de la LN.`);
    s.append(casos);
    if(!vacio(f.limite_inferior_ns)) {
        const rango=nodo('p');rango.className='rango-ns';
        rango.append(nodo('strong','Abstención 2021 según cómo se cuente NS: '),`${porcentaje(f.limite_inferior_ns)} (NS como participación) a ${porcentaje(f.limite_superior_ns)} (NS como abstención). Describe los conteos de 2021.`);
        s.append(rango);
    }
    const calidad=nodo('p');calidad.className='calidad';
    calidad.append(chip(texto(f.estado_calidad_orientacion),f.estado_calidad_orientacion==='conteos_especificados_completos'?'ok':'atencion'),nodo('span',f.motivo_calidad_orientacion||''));
    s.append(calidad);
    return s;
}
function seleccionar(id, enfocar=false) {
    seleccion=id;
    const f=filas.find(f=>f.id_datos===id);
    if (!f) return;
    const {nombre,resto}=partir_etiqueta(f.etiqueta_datos,f.entidad_id,f.municipio_id);
    const cabecera=nodo('header');cabecera.className='detalle-cabecera';
    const subtitulo=nodo('p',[etiqueta_entidad(f.entidad_id,nombres_entidad),`Clave ${f.entidad_id}/${f.municipio_id}`,resto].filter(Boolean).join(' · '));
    const chips=nodo('div');chips.className='chips';
    chips.append(chip(f.estado_enlace==='solo_tabular'?'Sólo en tabla (sin polígono)':'Con polígono en el mapa'),
        chip(f.antecedente_backtesting==='True'?'Con evaluación histórica':'Sin evaluación histórica'));
    cabecera.append(nodo('h2',nombre),subtitulo,chips);
    const cifras=nodo('div');cifras.className='cifras';
    if(f.estado_estimacion==='sin_estimacion') {
        cifras.append(cifra('Abstención estimada 2027','Sin estimación',nodo('span',texto(f.motivo_sin_estimacion))));
    } else {
        const cambio=Number(f.delta_aplicado_pp);
        cifras.append(cifra('Abstención estimada 2027 · S0',porcentaje(f.tasa_s0),nivel(f.nivel_s0)),
            cifra(`Con el escenario ${f.escenario}`,porcentaje(f.tasa_s1),nivel(f.nivel_s1)),
            cifra('Diferencia frente a S0',cambio===0?'0.00 pp':`${cambio>0?'−':'+'}${puntos(Math.abs(cambio))}`,nodo('span',cambio>0?'reducción supuesta':cambio<0?'aumento supuesto':'sin cambio')));
    }
    // El recorte sólo se informa cuando el límite 0–100 % impidió aplicar el cambio completo.
    if(!vacio(f.recorte_pp)&&Number(f.recorte_pp)!==0) cifras.append(Object.assign(nodo('p',`El cambio supuesto se recortó ${puntos(Math.abs(Number(f.recorte_pp)))} al llegar al límite de 0–100 %.`),{className:'nota-recorte'}));
    $('detalle').replaceChildren(cabecera,cifras,bloque_origen(f),bloque_propuesta(f));
    boton_cerrar();
    document.body.classList.add('detalle-abierto');
    $('municipio').value=id;
    pintar();
    if (enfocar) $('detalle').focus();
}
function seleccionar_feature(fid, enfocar=false) {
    const f=por_feature.get(fid);
    if (f) {seleccionar(f.id_datos,enfocar); return;}
    seleccion=null;
    const e=estados.get(fid);
    fila_detalle(e.etiqueta_mapa,[['Identificador del mapa',fid],['Estado',texto(e.estado_mapa)],['Motivo de enlace',texto(e.estado_enlace)],['Tasa','Sin tasa asignable al polígono'],['Referencia','ccpc_municipal_2024'],['Nota','Las tasas se asignan sólo a polígonos con enlace sustentado; nunca por coincidencia de nombre o clave.']]);
    document.body.classList.add('detalle-abierto');
    $('municipio').value='';
    pintar();
    if(enfocar) $('detalle').focus();
}
function ocultar_hover() { $('tooltip-mapa').hidden=true; }
function mostrar_hover(fid, evento) {
    const tooltip=$('tooltip-mapa');
    const resumen=resumen_hover(por_feature.get(fid),estados.get(fid));
    tooltip.replaceChildren(nodo('strong',resumen.titulo));
    for(const linea of resumen.lineas) tooltip.append(nodo('span',linea));
    tooltip.append(nodo('small','Clic para ver el detalle municipal'));
    tooltip.hidden=false;
    const rect=tooltip.getBoundingClientRect();
    tooltip.style.left=`${Math.max(8,Math.min(evento.clientX+16,window.innerWidth-rect.width-8))}px`;
    tooltip.style.top=`${Math.max(8,Math.min(evento.clientY+16,window.innerHeight-rect.height-8))}px`;
}
function cambiar_modo(solo) {
    ocultar_hover();
    document.body.classList.toggle('solo-mapa',solo);
    $('vista-mapa').setAttribute('aria-pressed',String(solo));
    $('vista-exploracion').setAttribute('aria-pressed',String(!solo));
    $('titulo-mapas').textContent=solo?'Exploración del mapa':'Referencia y escenario, lado a lado';
    history.replaceState(null,'',solo?'#mapa':location.pathname);
    window.scrollTo(0,0);
}
function actualizar_selector_municipal() {
    const fragment=document.createDocumentFragment();
    const primero=nodo('option',visibles.length?'Selecciona un municipio':'Sin municipios para estos filtros');
    primero.value='';fragment.append(primero);
    for(const f of visibles) {
        const option=nodo('option',`${f.etiqueta_datos}${f.estado_enlace==='solo_tabular'?' · Sólo tabular':''}`);
        option.value=f.id_datos;fragment.append(option);
    }
    $('municipio').replaceChildren(fragment);
    $('municipio').value=visibles.some(f=>f.id_datos===seleccion)?seleccion:'';
}
function actualizar_vista() { for (const id of ['mapa-s0','mapa-s1']) $(id).setAttribute('viewBox',vista.join(' ')); }
function zoom(factor) {
    vista=escalar_vista(vista,mapa.viewbox,factor); actualizar_vista();
}
function encuadrar() {
    const ids=new Set(visibles.map(f=>f.feature_id).filter(Boolean));
    const limites=mapa.features.filter(f=>ids.has(f.feature_id)).map(f=>f.limites);
    vista=encuadrar_vista(limites,mapa.viewbox);actualizar_vista();
}
function crear_mapas() {
    ['mapa-s0','mapa-s1'].forEach((id,i)=>{
        const svg=$(id), fragment=document.createDocumentFragment();
        for (const f of mapa.features) {
            const p=document.createElementNS(ns,'path');
            p.setAttribute('d',f.trazo); p.dataset.feature=f.feature_id;
            const t=document.createElementNS(ns,'desc'); t.textContent=estados.get(f.feature_id).etiqueta_mapa; p.append(t);
            fragment.append(p); paths[i].set(f.feature_id,p);
        }
        svg.append(fragment);
        svg.addEventListener('keydown',e=>{
            if(e.key==='Enter'&&e.target.dataset.feature) {
                e.preventDefault();ocultar_hover();seleccionar_feature(e.target.dataset.feature,true);return;
            }
            if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
            e.preventDefault();
            const opciones=[...paths[i].values()].filter(p=>!p.classList.contains('atenuado'));
            if(!opciones.length) return;
            const actual=opciones.indexOf(e.target);
            const paso=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;
            const siguiente=actual<0?(paso>0?0:opciones.length-1):(actual+paso+opciones.length)%opciones.length;
            const p=opciones[siguiente];p.setAttribute('tabindex','-1');p.focus({preventScroll:true});
            const rect=p.getBoundingClientRect();
            mostrar_hover(p.dataset.feature,{clientX:Math.max(8,rect.x+rect.width/2),clientY:Math.max(8,rect.y+rect.height/2)});
        });
        svg.addEventListener('focusout',ocultar_hover);
        let arrastre=null;
        svg.addEventListener('pointerdown',e=>{if(arrastre||e.button!==0)return;ocultar_hover();arrastre={pointer:e.pointerId,x:e.clientX,y:e.clientY,v:[...vista],movido:false,fid:e.target.dataset.feature};svg.setPointerCapture(e.pointerId);});
        svg.addEventListener('pointermove',e=>{
            if(!arrastre) {
                const p=e.target.closest('path[data-feature]');
                if(p&&!p.classList.contains('atenuado')) mostrar_hover(p.dataset.feature,e);
                else ocultar_hover();
                return;
            }
            if(e.pointerId!==arrastre.pointer)return;
            const escala=Math.min(svg.clientWidth/arrastre.v[2],svg.clientHeight/arrastre.v[3]);
            const dx=e.clientX-arrastre.x,dy=e.clientY-arrastre.y;
            if(Math.abs(dx)+Math.abs(dy)>4) arrastre.movido=true;
            if(arrastre.movido) {vista=[arrastre.v[0]-dx/escala,arrastre.v[1]-dy/escala,arrastre.v[2],arrastre.v[3]];actualizar_vista();}
        });
        svg.addEventListener('pointerup',e=>{if(!arrastre||e.pointerId!==arrastre.pointer)return;const seleccionada=arrastre;arrastre=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);if(!seleccionada.movido&&seleccionada.fid)seleccionar_feature(seleccionada.fid,true);});
        const cancelar=()=>{arrastre=null;ocultar_hover();};
        svg.addEventListener('pointercancel',cancelar);svg.addEventListener('lostpointercapture',cancelar);window.addEventListener('blur',cancelar);
        svg.addEventListener('pointerleave',ocultar_hover);
        svg.addEventListener('wheel',e=>{e.preventDefault();ocultar_hover();zoom(e.deltaY>0?1.2:1/1.2);},{passive:false});
    });
    vista=[...mapa.viewbox]; actualizar_vista();
}
function pintar() {
    const ids=new Set(visibles.map(f=>f.id_datos));
    const f=filtros(), consulta=new Set(estados_visibles(datos.estados_mapa,f).map(e=>e.feature_id));
    for(const [fid,e] of estados) {
        const u=por_feature.get(fid);
        // Los no enlazables siguen neutrales; su consulta aplica únicamente entidad/búsqueda.
        const visible=u?ids.has(u.id_datos):consulta.has(fid);
        for(let i=0;i<2;i++) {
            const p=paths[i].get(fid);
            p.setAttribute('class',`${u?u[i?'nivel_s1':'nivel_s0']:'sin_estimacion'}${visible?'':' atenuado'}${u&&u.id_datos===seleccion?' seleccionado':''}`);
            p.firstChild.textContent=`${e.etiqueta_mapa} · ${u?`${texto(u[i?'nivel_s1':'nivel_s0'])} · ${porcentaje(u[i?'tasa_s1':'tasa_s0'])}`:texto(e.estado_mapa)}`;
        }
    }
}
function tabla() {
    const p=paginar(visibles,pagina); pagina=p.pagina;
    const fragment=document.createDocumentFragment();
    for(const f of p.filas) {
        const tr=nodo('tr');
        const nombre=nodo('td',f.etiqueta_datos); nombre.append(nodo('small',etiqueta_entidad(f.entidad_id,nombres_entidad)));
        tr.append(nombre,nodo('td',porcentaje(f.tasa_s0)),nodo('td',porcentaje(f.tasa_s1)),nodo('td',puntos(f.delta_aplicado_pp)),nodo('td',`${texto(f.nivel_s0)} → ${texto(f.nivel_s1)}`),nodo('td',`${texto(f.estado_estimacion)} · ${texto(f.estado_enlace)}`),nodo('td',texto(f.ruta_revision)));
        const td=nodo('td'), b=nodo('button','Ver detalle'); b.setAttribute('aria-label',`Ver detalle de ${f.etiqueta_datos}`); b.addEventListener('click',()=>seleccionar(f.id_datos,true));td.append(b);tr.append(td);fragment.append(tr);
    }
    if(!visibles.length){const td=nodo('td','No hay municipios que coincidan. Revisa la búsqueda o la entidad, o usa «Limpiar filtros».');td.colSpan=8;const tr=nodo('tr');tr.append(td);fragment.append(tr);}
    $('filas').replaceChildren(fragment);$('pagina').textContent=`Página ${p.pagina+1} de ${p.paginas}`;
    $('anterior').disabled=p.pagina===0;$('siguiente').disabled=p.pagina===p.paginas-1;
    $('resultados').textContent=`${visibles.length.toLocaleString('es-MX')} municipios · escenario ${$('escenario').value} · 50 filas por página`;
}
function tabla_cartografia() {
    const consultables=estados_visibles(datos.estados_mapa,filtros());
    const p=paginar(consultables,cart_pagina); cart_pagina=p.pagina;
    const fragment=document.createDocumentFragment();
    for(const e of p.filas) {
        const tr=nodo('tr');tr.append(nodo('td',e.feature_id),nodo('td',e.etiqueta_mapa),nodo('td',texto(e.estado_mapa)));
        const td=nodo('td'), b=nodo('button','Ver estado');b.setAttribute('aria-label',`Ver estado de ${e.etiqueta_mapa}`);b.addEventListener('click',()=>seleccionar_feature(e.feature_id,true));td.append(b);tr.append(td);fragment.append(tr);
    }
    $('filas-cartografia').replaceChildren(fragment);$('total-cartografia').textContent=`${consultables.length} polígonos; ${consultables.filter(e=>e.estado_mapa==='sin_origen_2021').length} sin origen 2021.`;
    $('cart-pagina').textContent=`Página ${p.pagina+1} de ${p.paginas}`;$('cart-anterior').disabled=p.pagina===0;$('cart-siguiente').disabled=p.pagina===p.paginas-1;
}
function actualizar() {
    const detalle_abierto=document.body.classList.contains('detalle-abierto');
    ocultar_hover();
    filas=filas_consulta(datos,$('escenario').value,manifiesto?.codigo_sha256?.[ruta_recomendaciones(datos.recomendaciones)] || '');
    por_feature=new Map(filas.filter(f=>f.feature_id).map(f=>[f.feature_id,f]));
    visibles=filtrar(filas,filtros());
    $('total').textContent=visibles.length.toLocaleString('es-MX');
    $('con-tasa').textContent=visibles.filter(f=>f.estado_estimacion==='calculable').length.toLocaleString('es-MX');
    $('sin-tasa').textContent=visibles.filter(f=>f.estado_estimacion==='sin_estimacion').length.toLocaleString('es-MX');
    $('sin-enlace').textContent=visibles.filter(f=>f.estado_enlace==='solo_tabular').length.toLocaleString('es-MX');
    const escenario=datos.receta.escenarios.find(e=>e.id===$('escenario').value);
    resumen_cobertura('cobertura-global',datos.base);resumen_cobertura('cobertura-filtrada',visibles);
    $('descripcion').replaceChildren(nodo('strong','Qué cambia: '),nodo('span',describir_escenario(escenario)));
    $('titulo-s1').textContent=etiqueta_escenario(escenario);
    $('columna-escenario').textContent=`Escenario ${escenario.id}`;
    if(seleccion&&visibles.some(f=>f.id_datos===seleccion)) {
        seleccionar(seleccion);
        document.body.classList.toggle('detalle-abierto',detalle_abierto);
    }
    else {seleccion=null;document.body.classList.remove('detalle-abierto');$('detalle').replaceChildren(nodo('h2','Detalle municipal'),Object.assign(nodo('p','Selecciona un municipio en el mapa, en la tabla o con la búsqueda para ver sus cifras, datos de origen y orientación.'),{className:'vacio'}));boton_cerrar();}
    actualizar_selector_municipal();
    const cantidad=filtros_ids.filter(id=>$(id).value).length;
    const global=cobertura(datos.base), actual=cobertura(visibles);
    $('cobertura-mapa').textContent=`Universo: ${entero(global.municipios)} municipios y LN 2021 de ${entero(global.ln_total)}; sólo tabulares con tasa: ${global.grupos.con_tasa_solo_tabular.porcentaje_ln===null?'porcentaje no calculable':porcentaje(global.grupos.con_tasa_solo_tabular.porcentaje_ln)} de LN. Consulta filtrada: LN ${entero(actual.ln_total)}; sólo tabulares con tasa: ${actual.grupos.con_tasa_solo_tabular.porcentaje_ln===null?'porcentaje no calculable':porcentaje(actual.grupos.con_tasa_solo_tabular.porcentaje_ln)} de LN de la consulta.`;
    const solo_tabulares=visibles.filter(f=>f.estado_enlace==='solo_tabular').length;
    $('estado-filtros-mapa').textContent=`${visibles.length.toLocaleString('es-MX')} municipios · ${cantidad} filtros activos · ${solo_tabulares} sólo tabulares (consulta en selector)`;
    const avanzados=avanzados_ids.filter(id=>$(id).value).length;
    $('cuenta-avanzados').textContent=avanzados?`· ${avanzados} ${avanzados===1?'activo':'activos'}`:'';
    $('explicacion-filtros').textContent=visibles.length
        ? `Mostrando ${entero(visibles.length)} de ${entero(filas.length)} municipios · ${describir_filtros()}.${solo_tabulares?` ${entero(solo_tabulares)} con datos sólo en tabla: no aparecen en el mapa.`:''}${$('nivel').value?' El filtro «Nivel del escenario» cambia al elegir otro escenario.':''}`
        : `Ningún municipio cumple los filtros (${describir_filtros()}). Revisa la búsqueda o usa «Limpiar filtros».`;
    $('resumen-descarga').textContent=visibles.length?`Cada descarga contendrá ${entero(visibles.length)} ${visibles.length===1?'fila':'filas'} (todas las páginas de la tabla), con el escenario ${$('escenario').value} como contexto.`:'No hay filas para descargar. Cambia los filtros o usa «Limpiar filtros».';
    $('descargar').disabled=!visibles.length;$('descargar-recomendaciones').disabled=!visibles.length;
    tabla();tabla_cartografia();pintar();
}
async function leer_json(url) {
    const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error(`No se pudo leer ${url}: HTTP ${r.status}`);
    return r.json();
}
async function verificado(nombre) {
    const r=await fetch(nombre,{cache:'no-store'});if(!r.ok)throw Error(`Falta ${nombre}.`);
    const buffer=await r.arrayBuffer();
    if(!globalThis.crypto?.subtle)throw Error('La verificación requiere localhost o un contexto seguro.');
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(v=>v.toString(16).padStart(2,'0')).join('');
    if(hash!==manifiesto.artefactos_sha256[nombre])throw Error(`Integridad inválida: ${nombre}.`);
    return new TextDecoder('utf-8',{fatal:true}).decode(buffer);
}
async function iniciar() {
    const archivo_producto=document.documentElement.dataset.producto || 'producto.json';
    const respuesta=await fetch(archivo_producto,{cache:'no-store'});
    if(respuesta.ok) {
        const producto=validar_producto(await respuesta.json());
        ({datos,mapa}=producto);
    } else {
        if(respuesta.status!==404 || document.documentElement.dataset.producto)throw Error(`No se pudo leer ${archivo_producto}: HTTP ${respuesta.status}.`);
        manifiesto=await leer_json('manifiesto.json');
        if(![2,3].includes(manifiesto.version)||manifiesto.estado!=='entrega')throw Error('Manifiesto incompatible.');
        const [d,m,c]=await Promise.all(['datos.json','mapa.json','contrato.json'].map(verificado));
        const contrato=JSON.parse(c);datos=JSON.parse(d);mapa=JSON.parse(m);
        if(contrato.version!==manifiesto.version||contrato.estado!=='entrega'||datos.version!==manifiesto.version||datos.estado!=='entrega'||datos.naturaleza!==manifiesto.naturaleza)throw Error('Contrato o naturaleza incompatible.');
        await Promise.all(['index.html','visor.css','visor.mjs','logica.mjs','producto.mjs','diccionario.csv'].map(verificado));
    }
    validar_recomendaciones(datos.recomendaciones);
    $('calidad').disabled=datos.recomendaciones.version<3;
    if(datos.recomendaciones.version<3)$('calidad').title='Este paquete histórico conserva su política anterior de orientación.';
    estados=new Map(datos.estados_mapa.map(f=>[f.feature_id,f]));
    if(estados.size!==mapa.features.length||new Set(mapa.features.map(f=>f.feature_id)).size!==estados.size||mapa.features.some(f=>!estados.has(f.feature_id)))throw Error('Inventario cartográfico incompatible.');
    const grupos=grupos_escenarios(datos.receta.escenarios);
    for(const [titulo,lista] of [['Opciones centrales',grupos.centrales],['Sensibilidad (opcional)',grupos.sensibilidad]]) {
        if(!lista.length) continue;
        const g=nodo('optgroup');g.label=titulo;
        for(const e of lista){const o=nodo('option',etiqueta_escenario(e));o.value=e.id;g.append(o);}
        $('escenario').append(g);
    }
    $('escenario').value=datos.receta.escenarios.some(e=>e.id==='S1')?'S1':'S0';
    nombres_entidad=new Map((datos.entidades||[]).map(e=>[e.entidad_id,e.entidad_nombre]));
    for(const entidad of [...new Set(datos.base.map(f=>f.entidad_id))].sort()){const o=nodo('option',etiqueta_entidad(entidad,nombres_entidad));o.value=entidad;$('entidad').append(o);}
    if(!nombres_entidad.size)$('ayuda-entidad').textContent='Clave CCPC de la entidad. El mapa se acerca a la entidad.';
    for(const [ruta,accion] of Object.entries(datos.recomendaciones.acciones)){const o=nodo('option',texto(ruta));o.value=ruta;o.title=accion;$('orientacion').append(o);}
    const u=datos.umbrales.principal;
    $('cortes').textContent=`Niveles según los tercios de S0 (${u.n.toLocaleString('es-MX')} municipios con tasa): bajo, menos de ${porcentaje(u.cortes[0])}; medio, de ${porcentaje(u.cortes[0])} a menos de ${porcentaje(u.cortes[1])}; alto, ${porcentaje(u.cortes[1])} o más. Los cortes son los mismos en todos los escenarios. ${u.estado==='sin_separacion'?'Los cortes coinciden: no se separan niveles.':''}`;
    const sociodemografico=datos.naturaleza==='s0_sociodemografico', meta=$('metadatos');
    const seccion=(titulo,...hijos)=>{const s=nodo('section');s.append(nodo('h3',titulo),...hijos);meta.append(s);};
    const lista=(items,tipo='ul')=>{const l=nodo(tipo);for(const i of items)l.append(i instanceof Node?i:nodo('li',i));return l;};
    seccion('Cómo se calcula',lista([
        sociodemografico?'S0 es la abstención estimada para 2027 por un modelo ridge (alpha 0.1). Se entrenó con 2009→2015 y se aplica, sin reajuste, a los datos de 2021: abstención previa, lista nominal, NS/LN, edad y sexo.':referencia(),
        ...(sociodemografico?['Su evaluación 2015→2021 es retrospectiva y tuvo exposición previa a esos datos.']:[]),
        'Los escenarios suman o restan los mismos puntos porcentuales a S0 en todos los municipios con tasa: S1 resta 2; las sensibilidades restan 1 o 5, o suman 2. Las tasas se limitan a 0–100 %.',
        `Los niveles bajo, medio y alto dividen S0 en tercios (cortes en ${u.cortes.map(porcentaje).join(' y ')}). Los cortes son fijos: un cambio de color en un escenario indica que cruza un corte.`]));
    const glosario=nodo('dl');glosario.className='glosario';
    for(const [termino,definicion] of [
        ['LN','Lista nominal de 2021: personas registradas para votar en el municipio.'],
        ['SV · NV · NS','Votaron, no votaron y participación no especificada en los conteos de 2021. SV + NV + NS = LN.'],
        ['Tasa de abstención','NV / (SV + NV): no votaron entre los casos especificados. NS queda fuera del cálculo.'],
        ['NS / LN','Proporción de la lista sin participación especificada. Indica la calidad del dato de 2021.'],
        ['Rango según NS','Abstención 2021 si NS se cuenta como participación (NV/LN) o como abstención ((NV+NS)/LN).'],
        ['pp','Puntos porcentuales: de 48 % a 46 % hay 2 pp.'],
        ['Sin estimación','Municipio sin tasa utilizable: en 2021 no hay casos especificados (SV + NV = 0).'],
        ['Sólo tabular','Municipio con datos y tasa, pero sin polígono enlazado en el mapa 2024; se consulta en la tabla y los CSV.'],
        ['Soporte del modelo','Indica si las variables del municipio están dentro del rango visto en el entrenamiento.'],
        ['Evaluación histórica','Indica si el municipio tiene antecedente en la evaluación retrospectiva 2015→2021.']]) {
        const g=nodo('div');g.append(nodo('dt',termino),nodo('dd',definicion));glosario.append(g);
    }
    seccion('Glosario',glosario);
    const criterios={verificar_datos:'No tiene tasa estimada.',revisar_calidad:'Tiene NS positivo, conteos incompletos o bloqueos de la fuente en 2021.',revisar_soporte:'Sus variables están fuera del rango de entrenamiento del modelo.',diagnostico_sin_antecedente:'No tiene evaluación histórica.',diagnostico_sin_separacion:'Los cortes de nivel no separan grupos.',explorar_piloto:'Nivel S0 alto.',informacion_y_diagnostico:'Nivel S0 bajo o medio.'};
    const conteo={};for(const f of filas_consulta(datos,'S0'))conteo[f.ruta_revision]=(conteo[f.ruta_revision]||0)+1;
    const rutas=Object.keys(criterios).filter(r=>r in datos.recomendaciones.acciones&&conteo[r]).map(r=>{
        const li=nodo('li');li.append(nodo('strong',texto(r)),` · ${entero(conteo[r]||0)} municipios. ${criterios[r]}`);return li;
    });
    const orden=lista(rutas,'ol');orden.className='rutas';
    seccion('Cómo se asigna la orientación',nodo('p','Cada municipio recibe la primera ruta cuyo criterio cumple, en este orden. Depende de S0 y de la calidad de 2021, no del escenario elegido.'),orden);
    seccion('Procedencia',lista([`Datos CCPC 2021 (${datos.base[0]?.referencia_datos||'sin referencia'}) y mapa CCPC 2024 (${datos.base[0]?.referencia_mapa||'sin referencia'}); receta ${datos.base[0]?.receta_operativa||'sin receta'}.`,'La descarga de orientación incluye para cada municipio la acción sugerida, sus condiciones, la evidencia por reunir y cómo evaluar un piloto.']));
    const contexto=contexto_entrada(datos.naturaleza);
    $('contexto-datos').textContent=contexto.aviso;
    $('titulo-s0').textContent=contexto.titulo_s0;
    $('aviso-referencia').replaceChildren(nodo('strong',datos.naturaleza==='sintetica'?contexto.aviso:'Resultados exploratorios'),nodo('span',` · ${referencia()} S1, el escenario central, supone una reducción de 2 puntos porcentuales.`));
    const raiz=document.documentElement.dataset;
    if(raiz.diccionario)$('enlace-diccionario').href=raiz.diccionario;
    if(raiz.datos) {
        const archivos=$('archivos-completos');archivos.append('Archivos completos del paquete: ');
        [[`${raiz.datos}escenarios.csv`,'escenarios (cinco escenarios)'],[`${raiz.datos}orientacion.csv`,'orientación'],[`${raiz.datos}base_modelo.csv`,'base del modelo'],[`${raiz.mapas}escenarios.geojson`,'mapa GeoJSON'],[raiz.diccionario,'diccionario']].forEach(([href,nombre],i)=>{
            const a=nodo('a',nombre);a.href=href;a.setAttribute('download','');archivos.append(i?' · ':'',a);
        });
        archivos.hidden=false;
    }
    crear_mapas();
    for(const id of [...filtros_ids,'escenario'])$(id).addEventListener(id==='buscar'?'input':'change',()=>{pagina=0;cart_pagina=0;actualizar();if(id==='entidad')encuadrar();});
    $('limpiar').onclick=()=>{for(const id of filtros_ids)$(id).value='';pagina=0;cart_pagina=0;actualizar();vista=[...mapa.viewbox];actualizar_vista();};
    $('anterior').onclick=()=>{pagina--;tabla();};$('siguiente').onclick=()=>{pagina++;tabla();};
    $('cart-anterior').onclick=()=>{cart_pagina--;tabla_cartografia();};$('cart-siguiente').onclick=()=>{cart_pagina++;tabla_cartografia();};
    $('vista-mapa').onclick=()=>cambiar_modo(true);
    $('vista-exploracion').onclick=()=>cambiar_modo(false);
    $('capa-mapa').onchange=()=>{
        ocultar_hover();document.body.classList.toggle('capa-s0',$('capa-mapa').value==='s0');
    };
    $('municipio').onchange=()=>{
        if($('municipio').value) seleccionar($('municipio').value,true);
    };
    document.addEventListener('keydown',e=>{
        if(e.key==='Escape') {ocultar_hover();document.body.classList.remove('detalle-abierto');if(document.body.classList.contains('solo-mapa'))$('municipio').focus();}
    });
    $('encuadrar').onclick=encuadrar;
    $('acercar').onclick=()=>zoom(1/1.5);$('alejar').onclick=()=>zoom(1.5);$('restablecer').onclick=()=>{vista=[...mapa.viewbox];actualizar_vista();};
    $('descargar').onclick=()=>{
        if(!visibles.length)return;
        const blob=new Blob([csv(visibles,datos.campos_csv)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=nodo('a');
        a.href=url;a.download=`escenarios_${$('escenario').value}_filtrados.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    $('descargar-recomendaciones').onclick=()=>{
        if(!visibles.length)return;
        const filas_propuestas=visibles;
        const blob=new Blob([csv(filas_propuestas,datos.campos_exportacion_orientacion || datos.recomendaciones.campos_csv)],{type:'text/csv;charset=utf-8'});
        const url=URL.createObjectURL(blob),a=nodo('a');
        a.href=url;a.download=`propuestas_S0_consulta_${$('escenario').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    $('app').hidden=false;$('carga').hidden=true;actualizar();cambiar_modo(location.hash==='#mapa');
}
$('reintentar').onclick=()=>location.reload();
iniciar().catch(error=>{$('reintentar').hidden=false;$('app').hidden=true;$('carga').hidden=false;$('carga').className='error';$('carga').setAttribute('role','alert');$('carga').textContent=`No se puede abrir el visor: ${error.message} Comprueba que la terminal de iniciar.py sigue abierta y pulsa «Volver a cargar». Si el error continúa, extrae de nuevo el ZIP completo en una carpeta nueva.`;$('reintentar').focus();});
