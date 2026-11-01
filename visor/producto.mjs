// Valida coherencia de un producto transportable; no acredita autenticidad externa.
import {vacio, unir, recomendar, diagnosticar_calidad} from './logica.mjs';

const numero = valor => (typeof valor==='number' || typeof valor==='string' && valor.trim()!=='')
    && Number.isFinite(Number(valor));
const tasa = valor => numero(valor) && Number(valor) >= 0 && Number(valor) <= 1;
const iguales = (a,b) => numero(a) && numero(b) && Math.abs(Number(a)-Number(b)) <= 1e-12;
function exigir(condicion, mensaje) {
    if(!condicion) throw Error(`Datos del producto incompatibles: ${mensaje}.`);
}
function indice_unico(filas, campo, nombre) {
    exigir(Array.isArray(filas), `falta ${nombre}`);
    const indice = new Map();
    for(const f of filas) {
        exigir(f && typeof f[campo] === 'string' && f[campo] && !indice.has(f[campo]), `${nombre} con identificador vacío o duplicado`);
        indice.set(f[campo], f);
    }
    return indice;
}

// Una sola lista alimenta orientación, filtros, tabla y exportaciones.
export function filas_consulta(datos, escenario, receta_sha256='') {
    return unir(datos.base,datos.escenarios,escenario).map(f=>{
        const calidad=datos.recomendaciones.version>=3
            ? diagnosticar_calidad(f,datos.umbrales.principal.cortes) : {};
        if(datos.calidad?.[f.id_datos]) {
            const registrada=datos.calidad[f.id_datos];
            const cuantitativos=['denominador_especificado','fraccion_especificada','limite_inferior_ns','limite_superior_ns'];
            exigir(Object.entries(calidad).every(([campo,valor])=>cuantitativos.includes(campo)&&!vacio(valor)
                ? iguales(registrada[campo],valor) : String(registrada[campo])===String(valor)), 'diagnóstico de calidad distinto de conteos');
        }
        return recomendar({...f,...calidad},datos.recomendaciones,datos.naturaleza,receta_sha256);
    });
}

export function validar_producto(producto) {
    exigir(producto?.version===1 && producto.estado==='producto_exploratorio', 'versión o estado');
    const {datos, mapa}=producto;
    exigir([2,3].includes(datos?.version) && datos.estado==='entrega', 'consulta municipal');
    exigir(['s0_historico','s0_sociodemografico','sintetica'].includes(datos.naturaleza), 'naturaleza desconocida');
    if(datos.naturaleza==='s0_sociodemografico') exigir(datos.version===3 && datos.modelo?.candidato==='ridge_con_edad_y_sexo_0_1' && datos.modelo.exposicion_previa_2021===true && datos.modelo.precision_2027_acreditada===false, 'identificación del modelo exploratorio');
    const base=indice_unico(datos.base,'id_datos','base municipal');
    exigir(base.size>0, 'base municipal vacía');
    const escenarios=indice_unico(datos.receta?.escenarios,'id','receta de escenarios');
    exigir(escenarios.has('S0') && Number(escenarios.get('S0').delta_pp)===0, 'referencia S0 ausente');
    for(const e of escenarios.values()) exigir(typeof e.delta_pp==='number' && Number.isFinite(e.delta_pp), 'cambio supuesto inválido');
    const cortes=datos.umbrales?.principal?.cortes;
    exigir(Array.isArray(cortes) && cortes.length===2 && cortes.every(tasa) && Number(cortes[0])<=Number(cortes[1]), 'cortes S0');
    const nivel=valor=>Number(cortes[0])===Number(cortes[1])?'sin_separacion':Number(valor)<Number(cortes[0])?'bajo':Number(valor)<Number(cortes[1])?'medio':'alto';
    for(const f of base.values()) {
        exigir(typeof f.entidad_id==='string' && /^\d+$/.test(f.entidad_id) && typeof f.municipio_id==='string' && /^\d+$/.test(f.municipio_id), 'claves territoriales deben ser texto');
        exigir(['calculable','sin_estimacion'].includes(f.estado_estimacion), 'estado de estimación');
        exigir(['enlace_sustentado','solo_tabular'].includes(f.estado_enlace), 'estado de enlace municipal');
        exigir(f.estado_estimacion==='calculable'?tasa(f.tasa_exploratoria):vacio(f.tasa_exploratoria), 'tasa de base o ausencia');
        for(const campo of ['ln_2021','sv_2021','nv_2021','ns_2021']) exigir(numero(f[campo]) && Number.isSafeInteger(Number(f[campo])) && Number(f[campo])>=0, `conteo ${campo}`);
        exigir(Number(f.ln_2021)===Number(f.sv_2021)+Number(f.nv_2021)+Number(f.ns_2021), 'sumas LN/SV/NV/NS');
    }
    exigir(Array.isArray(datos.escenarios) && datos.escenarios.length===base.size*escenarios.size, 'universo de escenarios');
    const vistos=new Set();
    for(const fila of datos.escenarios) {
        const f=base.get(fila.id_datos), e=escenarios.get(fila.escenario), k=`${fila.escenario}\u0000${fila.id_datos}`;
        exigir(f && e && !vistos.has(k), 'unión de escenarios incompleta o duplicada');
        vistos.add(k);
        if(f.estado_estimacion==='sin_estimacion') {
            exigir(['tasa_s0','tasa_s1','tasa_s1_bruta','delta_aplicado_pp'].every(c=>vacio(fila[c])) && fila.nivel_s0==='sin_estimacion' && fila.nivel_s1==='sin_estimacion', 'ausencia convertida en tasa');
        } else {
            const bruto=Number(f.tasa_exploratoria)-e.delta_pp/100, limitado=Math.max(0,Math.min(1,bruto));
            exigir(iguales(fila.tasa_s0,f.tasa_exploratoria) && iguales(fila.tasa_s1_bruta,bruto) && iguales(fila.tasa_s1,limitado), 'tasas de escenarios');
            exigir(iguales(fila.delta_aplicado_pp,(Number(f.tasa_exploratoria)-limitado)*100), 'cambio aplicado');
            exigir(fila.nivel_s0===nivel(fila.tasa_s0) && fila.nivel_s1===nivel(fila.tasa_s1), 'niveles distintos de cortes fijos');
        }
    }
    const estados=indice_unico(datos.estados_mapa,'feature_id','estados del mapa');
    const features=indice_unico(mapa?.features,'feature_id','trazos del mapa');
    exigir(Array.isArray(mapa.viewbox) && mapa.viewbox.length===4 && mapa.viewbox.every(v=>typeof v==='number' && Number.isFinite(v)) && mapa.viewbox[2]>0 && mapa.viewbox[3]>0, 'marco del mapa');
    exigir(estados.size===features.size && [...features.keys()].every(k=>estados.has(k)), 'inventario del mapa');
    const enlazadas=new Map();
    for(const f of base.values()) {
        if(f.estado_enlace==='enlace_sustentado') {
            exigir(typeof f.feature_id==='string' && features.has(f.feature_id) && !enlazadas.has(f.feature_id), 'enlace cartográfico ausente o duplicado');
            enlazadas.set(f.feature_id,f);
        } else exigir(vacio(f.feature_id), 'unidad sólo tabular enlazada a un polígono');
    }
    for(const [id,f] of features) {
        exigir(typeof f.trazo==='string' && f.trazo.length>0 && /^[MLZ0-9,.\s-]+$/.test(f.trazo), 'trazo cartográfico inválido');
        exigir(Array.isArray(f.limites) && f.limites.length===4 && f.limites.every(v=>typeof v==='number' && Number.isFinite(v)), 'límites de un polígono');
        exigir(f.limites[0]<=f.limites[2] && f.limites[1]<=f.limites[3], 'límites de un polígono invertidos');
        const e=estados.get(id), unidad=enlazadas.get(id);
        if(unidad) exigir(e.id_datos===unidad.id_datos && (unidad.estado_estimacion==='calculable'?iguales(e.tasa_exploratoria,unidad.tasa_exploratoria):vacio(e.tasa_exploratoria)), 'estado cartográfico distinto de la unidad');
        else exigir(vacio(e.id_datos) && vacio(e.tasa_exploratoria), 'polígono sin enlace con tasa asignada');
    }
    exigir(Array.isArray(datos.campos_csv) && datos.campos_csv.length>0 && new Set(datos.campos_csv).size===datos.campos_csv.length, 'columnas de descarga');
    if(datos.entidades!==undefined) {
        const entidades=indice_unico(datos.entidades,'entidad_id','nombres de entidad');
        for(const e of entidades.values()) exigir(/^\d+$/.test(e.entidad_id) && typeof e.entidad_nombre==='string' && e.entidad_nombre.trim()!=='', 'nombre de entidad vacío o clave no textual');
        for(const f of base.values()) exigir(entidades.get(f.entidad_id)?.entidad_nombre===f.entidad_nombre, 'nombre de entidad distinto del catálogo CCPC');
    }
    if(datos.campos_exportacion_orientacion!==undefined) {
        const campos=datos.campos_exportacion_orientacion;
        exigir(Array.isArray(campos) && new Set(campos).size===campos.length && datos.recomendaciones.campos_csv.every(c=>campos.includes(c)), 'columnas de orientación');
    }
    if(datos.conteos) exigir(datos.conteos.municipios===base.size && datos.conteos.features===features.size && datos.conteos.filas_escenarios===datos.escenarios.length, 'conteos publicados');
    filas_consulta(datos,'S0');
    return producto;
}
