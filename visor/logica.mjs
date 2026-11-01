// Funciones puras compartidas entre la interfaz y las pruebas de comportamiento.
export const vacio = valor => valor === '' || valor === null || valor === undefined;
export const normalizar = texto => String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function filtrar(filas, filtros) {
    const busqueda = normalizar(filtros.buscar).trim();
    return filas.filter(f => (!filtros.entidad || f.entidad_id === filtros.entidad)
        && (!filtros.nivel || f.nivel_s1 === filtros.nivel)
        && (!filtros.nivel_s0 || f.nivel_s0 === filtros.nivel_s0)
        && (!filtros.orientacion || f.ruta_revision === filtros.orientacion)
        && (!filtros.calidad || f.estado_calidad_orientacion === filtros.calidad)
        && (!filtros.disponibilidad || f.estado_estimacion === filtros.disponibilidad)
        && (!filtros.enlace || f.estado_enlace === filtros.enlace)
        && (!filtros.antecedente || f.antecedente_backtesting === filtros.antecedente)
        && (!busqueda || normalizar(`${f.etiqueta_datos} ${f.entidad_id}/${f.municipio_id} ${f.id_datos}`).includes(busqueda)));
}
export function unir(base, escenarios, escenario) {
    const indice = new Map(base.map(f => [f.id_datos, f]));
    const filas = escenarios.filter(f => f.escenario === escenario).map(f => {
        if (!indice.has(f.id_datos)) throw Error('Escenario sin unidad de base.');
        return {...indice.get(f.id_datos), ...f};
    });
    if (filas.length !== base.length || new Set(filas.map(f => f.id_datos)).size !== base.length) throw Error('Universo de escenario incompatible.');
    return filas.sort((a,b) => a.entidad_id.localeCompare(b.entidad_id) || a.municipio_id.localeCompare(b.municipio_id));
}
export function csv(filas, campos) {
    const celda = valor => `"${String(valor ?? '').replace(/"/g, '""')}"`;
    return [campos.map(celda).join(','), ...filas.map(f => campos.map(c => celda(f[c])).join(','))].join('\r\n') + '\r\n';
}
export function porcentaje(valor) {
    return vacio(valor) ? 'Sin estimación' : `${(Number(valor)*100).toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2})} %`;
}
export function puntos(valor) {
    return vacio(valor) ? 'No aplica' : `${Number(valor).toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2})} pp`;
}
export function paginar(filas, pagina, tamano=50) {
    const paginas = Math.max(1, Math.ceil(filas.length/tamano));
    const actual = Math.max(0, Math.min(pagina, paginas-1));
    return {filas: filas.slice(actual*tamano, (actual+1)*tamano), pagina: actual, paginas};
}
export function estados_visibles(estados, filtros) {
    const q = normalizar(filtros.buscar).trim();
    return estados.filter(f => (!filtros.entidad || f.entidad_id_mapa === filtros.entidad)
        && (!q || normalizar(`${f.etiqueta_mapa} ${f.entidad_id_mapa}/${f.municipio_id_mapa} ${f.feature_id}`).includes(q)));
}

// Encuadre y botones comparten los límites de escala y conservan el centro.
export function escalar_vista(vista, viewbox, factor) {
    const ancho = Math.min(viewbox[2]*2, Math.max(viewbox[2]/40, vista[2]*factor));
    const alto = ancho*viewbox[3]/viewbox[2];
    return [vista[0]+vista[2]/2-ancho/2, vista[1]+vista[3]/2-alto/2, ancho, alto];
}
export function encuadrar_vista(limites, viewbox) {
    if (!limites.length) return [...viewbox];
    const x = Math.min(...limites.map(b=>b[0])), y = Math.min(...limites.map(b=>b[1]));
    const ancho = Math.max(...limites.map(b=>b[2]))-x, alto = Math.max(...limites.map(b=>b[3]))-y;
    const w = Math.max(ancho, alto*viewbox[2]/viewbox[3], 1)*1.15, h = w*viewbox[3]/viewbox[2];
    return escalar_vista([x+ancho/2-w/2, y+alto/2-h/2, w, h], viewbox, 1);
}
export function contexto_entrada(naturaleza) {
    if (naturaleza === 'sintetica') return {
        aviso: 'MUESTRA SINTÉTICA · DATOS Y POLÍGONOS FICTICIOS · Sin valor predictivo',
        titulo_s0: 'S0 · Referencia sintética'
    };
    if (naturaleza === 's0_historico') return {
        aviso: 'Datos CCPC 2021 · Mapa CCPC 2024 · Escenarios ilustrativos para 2027',
        titulo_s0: 'S0 · Referencia histórica'
    };
    if (naturaleza === 's0_sociodemografico') return {
        aviso: 'Entradas CCPC 2021 · Mapa CCPC 2024 · Estimación exploratoria para 2027',
        titulo_s0: 'S0 · Referencia del modelo'
    };
    throw Error('Naturaleza de entrada incompatible.');
}

export const regla_calidad = 'completitud_especificada_sin_tolerancia_ns_v1';
const campos_calidad = ['denominador_especificado','fraccion_especificada',
    'limite_inferior_ns','limite_superior_ns','estabilidad_nivel_ns',
    'estado_calidad_orientacion','motivo_calidad_orientacion','regla_calidad_orientacion'];
function conteo_calidad(valor) {
    if(vacio(valor)||typeof valor==='string'&&!valor.trim()) return null;
    if(!((typeof valor==='string'&&/^\d+$/.test(valor))||typeof valor==='number')
        ||!Number.isSafeInteger(Number(valor))||Number(valor)<0) throw Error('Conteo de calidad inválido.');
    return Number(valor);
}
export function diagnosticar_calidad(unidad, cortes=null) {
    if(cortes!==null&&(!Array.isArray(cortes)||cortes.length!==2
        ||cortes.some(c=>typeof c!=='number'||!Number.isFinite(c)||c<0||c>1)||cortes[0]>cortes[1])) {
        throw Error('Cortes de sensibilidad incompatibles.');
    }
    const [ln,sv,nv,ns]=['ln','sv','nv','ns'].map(c=>conteo_calidad(unidad[`${c}_2021`]));
    const completos=[ln,sv,nv,ns].every(c=>c!==null), den=sv!==null&&nv!==null?sv+nv:null;
    if(completos&&ln!==sv+nv+ns) throw Error('LN debe ser igual a SV + NV + NS; no corregir la fuente.');
    if(ln!==null&&[sv,nv,ns,den].some(c=>c!==null&&c>ln)) throw Error('Conteo o denominador mayor que LN.');
    if(!vacio(unidad.proporcion_ns_2021)&&!(typeof unidad.proporcion_ns_2021==='string'&&!unidad.proporcion_ns_2021.trim())) {
        const proporcion=Number(unidad.proporcion_ns_2021);
        if(typeof unidad.proporcion_ns_2021==='boolean'||!Number.isFinite(proporcion)||proporcion<0||proporcion>1
            ||ln===null||ns===null||ln===0||Math.abs(proporcion-ns/ln)>Math.max(1e-12,1e-10*Math.max(Math.abs(proporcion),ns/ln))) {
            throw Error('NS/LN distinto de los conteos originales.');
        }
    }
    const inferior=completos&&ln>0?nv/ln:null, superior=completos&&ln>0?(nv+ns)/ln:null;
    const nivel=v=>v<cortes[0]?'bajo':v<cortes[1]?'medio':'alto';
    const estabilidad=inferior===null?(ln===0?'sin_denominador_ln':'sin_conteos_completos'):
        cortes===null?'sin_cortes':cortes[0]===cortes[1]?'sin_separacion':nivel(inferior)===nivel(superior)?'estable':'cambia_nivel';
    let estado, motivo;
    if(!completos) [estado,motivo]=['sin_conteos_completos','Faltan conteos de origen; revisar la fuente antes de priorizar.'];
    else if(ln===0||den===0) [estado,motivo]=['sin_denominador_especificado','Sin denominador especificado positivo; conservar la ausencia de tasa.'];
    else if(unidad.bloqueos_calidad||!vacio(unidad.estado_unicidad)&&unidad.estado_unicidad!=='verificada') [estado,motivo]=['revisar_fuente','La fuente conserva bloqueos de calidad; resolverlos antes de priorizar.'];
    else if(ns>0) [estado,motivo]=['revisar_ns','Hay NS en 2021 y no existe una tolerancia validada; revisar calidad antes de priorizar.'];
    else [estado,motivo]=['conteos_especificados_completos','NS=0: los conteos están especificados; aún deben revisarse soporte, antecedente y condiciones locales.'];
    const valores=[den,completos&&ln>0?den/ln:null,inferior,superior,estabilidad,estado,motivo,regla_calidad];
    return Object.fromEntries(campos_calidad.map((c,i)=>[c,valores[i]===null?'':String(valores[i])]));
}

export function cobertura(filas) {
    const grupos=Object.fromEntries(['con_tasa_enlace','con_tasa_solo_tabular','sin_tasa']
        .map(g=>[g,{municipios:0,ln:0,porcentaje_ln:null}]));
    const ids=new Set(); let ln_total=0, ln_faltante=0;
    for(const f of filas) {
        if(!f.id_datos||ids.has(f.id_datos)) throw Error('Cobertura requiere unidades municipales únicas.');
        ids.add(f.id_datos);
        if(!['calculable','sin_estimacion'].includes(f.estado_estimacion)
            ||!['enlace_sustentado','solo_tabular'].includes(f.estado_enlace)) throw Error('Estado municipal incompatible para cobertura.');
        const grupo=f.estado_estimacion==='sin_estimacion'?'sin_tasa':
            f.estado_enlace==='enlace_sustentado'?'con_tasa_enlace':'con_tasa_solo_tabular';
        const g=grupos[grupo], ln=conteo_calidad(f.ln_2021); g.municipios++;
        if(ln===null) { ln_faltante++;g.ln=null; }
        else { ln_total+=ln;if(g.ln!==null)g.ln+=ln; }
    }
    if(ln_faltante) ln_total=null;
    for(const g of Object.values(grupos)) g.porcentaje_ln=ln_total>0&&g.ln!==null?g.ln/ln_total:null;
    return {municipios:filas.length,ln_total,ln_faltante,grupos};
}

export function validar_recomendaciones(receta) {
    const rutas=['verificar_datos','revisar_soporte','diagnostico_sin_antecedente',
        'diagnostico_sin_separacion','explorar_piloto','informacion_y_diagnostico'];
    if(receta?.version===3) rutas.push('revisar_calidad');
    const campos_obligatorios=['id_datos','naturaleza','escenario_consultado','tasa_s0','ruta_revision','accion_propuesta'];
    if(receta?.version!==3) campos_obligatorios.push('receta_recomendacion_sha256');
    if(!((receta?.version===1&&receta.estado==='provisional')||([2,3].includes(receta?.version)&&receta.estado==='orientacion_condicionada'))||receta.base_decision!=='nivel_s0'
        ||typeof receta.id!=='string'||!receta.id||!Array.isArray(receta.campos_csv)
        ||receta.campos_csv.some(c=>typeof c!=='string'||!c)||new Set(receta.campos_csv).size!==receta.campos_csv.length
        ||campos_obligatorios.some(c=>!receta.campos_csv.includes(c))
        ||!Array.isArray(receta.limites)||!receta.limites.length
        ||rutas.some(r=>typeof receta.acciones?.[r]!=='string'||!receta.acciones[r])
        ||['condicion_uso','evidencia_faltante','evaluacion_piloto'].some(c=>typeof receta[c]!=='string'||!receta[c])
        ||(receta?.version===3&&(receta.politica_calidad!==regla_calidad||campos_calidad.some(c=>!receta.campos_csv.includes(c))))) {
        throw Error('Receta de recomendaciones incompatible.');
    }
}
export function recomendar(unidad, receta, naturaleza, receta_sha256, cortes=null) {
    if(!unidad) return null; // Una feature sin origen no crea una unidad municipal.
    const aplica_calidad=receta.version===3;
    let calidad={};
    if(aplica_calidad) {
        validar_recomendaciones(receta);
        calidad=diagnosticar_calidad(unidad,cortes);
        if(cortes===null&&unidad.regla_calidad_orientacion===regla_calidad
            &&['estable','cambia_nivel','sin_separacion'].includes(unidad.estabilidad_nivel_ns)) {
            calidad.estabilidad_nivel_ns=unidad.estabilidad_nivel_ns;
        }
    }
    let ruta;
    if(unidad.estado_estimacion==='sin_estimacion') ruta='verificar_datos';
    else if(aplica_calidad&&calidad.estado_calidad_orientacion!=='conteos_especificados_completos') ruta='revisar_calidad';
    else if(unidad.estado_soporte_modelo==='fuera') ruta='revisar_soporte';
    else if(unidad.antecedente_backtesting==='False') ruta='diagnostico_sin_antecedente';
    else if(unidad.nivel_s0==='sin_separacion') ruta='diagnostico_sin_separacion';
    else if(unidad.nivel_s0==='alto') ruta='explorar_piloto';
    else if(['bajo','medio'].includes(unidad.nivel_s0)) ruta='informacion_y_diagnostico';
    else throw Error('Unidad sin nivel S0 compatible para orientar la revisión.');
    const alertas=[];
    if(naturaleza==='sintetica') alertas.push('Muestra sintética: datos y polígonos ficticios.');
    if(unidad.estado_soporte_modelo==='fuera') alertas.push('Fuera del soporte del modelo; no extrapolar su error.');
    if(unidad.estado_soporte_7==='fuera') alertas.push('Fuera de los siete controles; conservar separado del soporte del modelo.');
    if(unidad.antecedente_backtesting==='False') alertas.push('Sin antecedente de evaluación; no trasladar métricas.');
    if(unidad.estado_enlace==='solo_tabular') alertas.push('Sólo tabular: consultar por clave; no transferir la tasa a un polígono.');
    if(aplica_calidad&&calidad.estado_calidad_orientacion!=='conteos_especificados_completos') alertas.push(calidad.motivo_calidad_orientacion);
    alertas.push(`LN de origen 2021: ${unidad.ln_2021}. NS/LN (calidad, no abstención): ${vacio(unidad.proporcion_ns_2021)?'Sin dato de calidad':porcentaje(unidad.proporcion_ns_2021)}. ${aplica_calidad?'La revisión de calidad no elimina tasas ni unidades.':'Sin umbral de exclusión.'}`);
    return {...unidad, ...calidad, naturaleza, escenario_consultado:unidad.escenario,
        receta_recomendacion:receta.id, receta_recomendacion_sha256:receta_sha256,
        estado_propuesta:naturaleza==='sintetica'?'muestra_sintetica':receta.version>=2?'orientacion_condicionada':'exploratoria_no_aceptada',
        ruta_revision:ruta, accion_propuesta:receta.acciones[ruta],
        condicion_uso:receta.condicion_uso, evidencia_faltante:receta.evidencia_faltante,
        evaluacion_piloto:receta.evaluacion_piloto, alertas:alertas.join(' | ')};
}

// No se transfiere una tasa tabular a un polígono sin enlace certificado.
export function resumen_hover(unidad, estado) {
    if (!unidad) return {
        titulo: estado.etiqueta_mapa,
        lineas: [estado.estado_mapa === 'sin_origen_2021' ? 'Sin origen 2021' : 'Sin enlace sustentado',
            'Sin tasa asignable al polígono', 'Referencia cartográfica CCPC 2024']
    };
    return {
        titulo: unidad.etiqueta_datos,
        lineas: [`S0: ${porcentaje(unidad.tasa_s0)}`, `${unidad.escenario}: ${porcentaje(unidad.tasa_s1)}`,
            `Reducción aplicada: ${puntos(unidad.delta_aplicado_pp)}`,
            `Nivel: ${unidad.nivel_s0.replaceAll('_', ' ')} → ${unidad.nivel_s1.replaceAll('_', ' ')}`,
            ...(unidad.motivo_sin_estimacion ? [unidad.motivo_sin_estimacion.replaceAll('_', ' ')] : [])]
    };
}

// Los nombres de archivo se restringen a las recetas versionadas conocidas.
export function ruta_recomendaciones(receta) {
    validar_recomendaciones(receta);
    return receta.version===3?'data/esquemas/receta_recomendaciones_calidad.json':receta.version===2?'data/esquemas/receta_recomendaciones_entrega.json':'data/esquemas/receta_recomendaciones.json';
}
export function etiqueta_escenario(escenario) {
    if(escenario.delta_pp===0) return `${escenario.id} · Referencia sin cambio`;
    const cambio=escenario.delta_pp>0?'Reducción':'Aumento';
    return `${escenario.id} · ${cambio} de ${Math.abs(escenario.delta_pp)} pp${escenario.id==='S1'?' · central':''}`;
}
// Nombre CCPC y clave; sin nombre disponible se conserva sólo la clave textual.
export function etiqueta_entidad(clave, nombres) {
    const nombre=nombres?.get(clave);
    return nombre ? `${nombre} · ${clave}` : clave;
}
// S0 y S1 primero; las sensibilidades conservan su orden de receta.
export function grupos_escenarios(escenarios) {
    const centrales=escenarios.filter(e=>['S0','S1'].includes(e.id));
    return {centrales, sensibilidad:escenarios.filter(e=>!centrales.includes(e))};
}
// Separa el nombre municipal de su clave y referencia sin alterar la etiqueta original.
export function partir_etiqueta(etiqueta, entidad, municipio) {
    const texto=String(etiqueta ?? ''), clave=` · ${entidad}/${municipio}`, i=texto.indexOf(clave);
    if(i<=0) return {nombre:texto, resto:''};
    return {nombre:texto.slice(0,i), resto:texto.slice(i+clave.length).replace(/^ · /,'')};
}
// Composición de la LN 2021; null si faltan conteos o LN no es positiva.
export function composicion_ln(unidad) {
    const [ln,sv,nv,ns]=['ln','sv','nv','ns'].map(c=>unidad[`${c}_2021`]);
    if([ln,sv,nv,ns].some(v=>vacio(v)||!Number.isFinite(Number(v)))||Number(ln)<=0) return null;
    return {ln:Number(ln), partes:[['sv','Votaron (SV)',Number(sv)],['nv','No votaron (NV)',Number(nv)],['ns','No especificado (NS)',Number(ns)]]
        .map(([clave,nombre,valor])=>({clave,nombre,valor,proporcion:valor/Number(ln)}))};
}
