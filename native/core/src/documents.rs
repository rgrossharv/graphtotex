//! Direct conversion of structured documents, shared by the native and WASM builds.
//! No external resources, scripts, embedded macros, or TeX annotations are executed.
use crate::escape_tex;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    io::{Cursor, Read},
};

const MAX_EXPANDED: u64 = 128 * 1024 * 1024;
#[derive(Default, Debug)]
struct Node {
    tag: String,
    attrs: BTreeMap<String, String>,
    text: String,
    children: Vec<Node>,
}
impl Node {
    fn attr(&self, name: &str) -> &str {
        self.attrs.get(name).map(String::as_str).unwrap_or("")
    }
    fn child(&self, name: &str) -> Option<&Node> {
        self.children.iter().find(|n| n.tag == name)
    }
    fn find(&self, name: &str) -> Option<&Node> {
        if self.tag == name {
            Some(self)
        } else {
            self.children.iter().find_map(|c| c.find(name))
        }
    }
    fn content(&self) -> String {
        let mut out = self.text.clone();
        for c in &self.children {
            out.push_str(&c.content());
        }
        out
    }
}
fn xml_node(n: roxmltree::Node, depth: usize) -> Result<Node, String> {
    if depth > 128 {
        return Err("Document nesting exceeds 128 levels".into());
    }
    Ok(Node {
        tag: n.tag_name().name().into(),
        text: if n.is_text() {
            n.text().unwrap_or("").into()
        } else {
            String::new()
        },
        attrs: n
            .attributes()
            .map(|a| (a.name().into(), a.value().into()))
            .collect(),
        children: n
            .children()
            .filter(|c| c.is_element() || c.is_text())
            .map(|c| xml_node(c, depth + 1))
            .collect::<Result<_, _>>()?,
    })
}
fn parse_xml(text: &str) -> Result<Node, String> {
    let doc = roxmltree::Document::parse_with_options(
        text,
        roxmltree::ParsingOptions {
            allow_dtd: false,
            nodes_limit: 1_000_000,
            ..Default::default()
        },
    )
    .map_err(|e| format!("Invalid document XML: {e}"))?;
    xml_node(doc.root_element(), 0)
}
fn parse_html(text: &str) -> Result<Node, String> {
    fn node(n: scraper::ElementRef, depth: usize) -> Result<Node, String> {
        if depth > 128 {
            return Err("HTML nesting exceeds 128 levels".into());
        }
        let children = n
            .children()
            .filter_map(|c| match c.value() {
                scraper::Node::Text(t) => Some(Ok(Node {
                    text: t.to_string(),
                    ..Node::default()
                })),
                scraper::Node::Element(_) => {
                    Some(node(scraper::ElementRef::wrap(c).unwrap(), depth + 1))
                }
                _ => None,
            })
            .collect::<Result<_, _>>()?;
        Ok(Node {
            tag: n.value().name().into(),
            attrs: n
                .value()
                .attrs()
                .map(|(k, v)| (k.into(), v.into()))
                .collect(),
            children,
            ..Node::default()
        })
    }
    node(scraper::Html::parse_document(text).root_element(), 0)
}

#[derive(Debug, Serialize)]
pub struct Asset {
    pub name: String,
    #[serde(serialize_with = "asset_base64")]
    pub data: Vec<u8>,
}
fn asset_base64<S: serde::Serializer>(data: &[u8], serializer: S) -> Result<S::Ok, S::Error> {
    serializer.serialize_str(&STANDARD.encode(data))
}
#[derive(Debug, Serialize)]
pub struct DocumentResult {
    pub tex: String,
    pub text: String,
    pub blocks: usize,
    pub equations: usize,
    pub warnings: Vec<String>,
    pub assets: Vec<Asset>,
    pub format: String,
}
struct Context {
    files: BTreeMap<String, Vec<u8>>,
    relations: BTreeMap<String, String>,
    styles: BTreeMap<String, String>,
    numbering: BTreeMap<String, String>,
    assets: Vec<Asset>,
    asset_map: BTreeMap<String, String>,
    base: String,
    warnings: Vec<String>,
    blocks: usize,
    equations: usize,
    text: String,
}
impl Context {
    fn warn(&mut self, message: &str) {
        if self.warnings.len() < 100 && !self.warnings.iter().any(|w| w == message) {
            self.warnings.push(message.into());
        }
    }
    fn image(&mut self, path: &str) -> String {
        let path = path.split('#').next().unwrap_or(path);
        let path = normalize(&format!("{}/{}", self.base, path));
        if let Some(name) = self.asset_map.get(&path) {
            return format!("\\includegraphics[width=0.8\\linewidth,height=0.7\\textheight,keepaspectratio]{{{name}}}");
        }
        let extension = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
        if !["png", "jpg", "jpeg", "pdf"].contains(&extension.as_str()) {
            self.warn("An unsupported image format was replaced with a placeholder; convert SVG/EMF/GIF to PNG if needed.");
            return "[Image omitted]".into();
        }
        if let Some(data) = self.files.get(&path) {
            let name = format!("assets/image-{}.{}", self.assets.len() + 1, extension);
            self.assets.push(Asset {
                name: name.clone(),
                data: data.clone(),
            });
            self.asset_map.insert(path, name.clone());
            format!("\\includegraphics[width=0.8\\linewidth,height=0.7\\textheight,keepaspectratio]{{{name}}}")
        } else {
            self.warn("An image was missing or external; remote resources are never fetched.");
            "[Image unavailable]".into()
        }
    }
}
fn normalize(path: &str) -> String {
    let mut parts = Vec::new();
    for p in path.split('/') {
        match p {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            _ => parts.push(p),
        }
    }
    parts.join("/")
}
fn archive(bytes: &[u8]) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|e| format!("Invalid document ZIP: {e}"))?;
    if zip.len() > 10000 {
        return Err("Archive has too many entries".into());
    }
    let mut files = BTreeMap::new();
    let mut total = 0;
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| format!("Encrypted or unsupported archive entry: {e}"))?;
        if entry.is_dir() {
            continue;
        }
        let path = entry.name().to_owned();
        if path.starts_with('/') || path.split('/').any(|p| p == "..") || path.contains('\\') {
            return Err("Unsafe path in document archive".into());
        }
        total += entry.size();
        if total > MAX_EXPANDED {
            return Err("Expanded document exceeds 128 MB".into());
        }
        let mut data = Vec::new();
        (&mut entry)
            .take(MAX_EXPANDED + 1)
            .read_to_end(&mut data)
            .map_err(|e| e.to_string())?;
        if data.len() as u64 > MAX_EXPANDED {
            return Err("Archive entry exceeds limit".into());
        }
        files.insert(path, data);
    }
    Ok(files)
}
fn get_xml(ctx: &Context, path: &str) -> Result<Node, String> {
    parse_xml(
        std::str::from_utf8(
            ctx.files
                .get(path)
                .ok_or_else(|| format!("Missing document component: {path}"))?,
        )
        .map_err(|_| "Document XML is not UTF-8")?,
    )
}
// Structure comes from OMML or Presentation MathML, never from executable TeX
// annotations. See W3C MathML 3 chapter 3 and Microsoft Office Math schemas.
fn math_symbol(c: char) -> Option<&'static str> {
    Some(match c {
        'α'=>"\\alpha",'β'=>"\\beta",'γ'=>"\\gamma",'δ'=>"\\delta",'ε'=>"\\varepsilon",'ϵ'=>"\\epsilon",'ζ'=>"\\zeta",'η'=>"\\eta",'θ'=>"\\theta",'ϑ'=>"\\vartheta",'ι'=>"\\iota",'κ'=>"\\kappa",'ϰ'=>"\\varkappa",'λ'=>"\\lambda",'μ'=>"\\mu",'ν'=>"\\nu",'ξ'=>"\\xi",'π'=>"\\pi",'ϖ'=>"\\varpi",'ρ'=>"\\rho",'ϱ'=>"\\varrho",'σ'=>"\\sigma",'ς'=>"\\varsigma",'τ'=>"\\tau",'υ'=>"\\upsilon",'φ'=>"\\varphi",'ϕ'=>"\\phi",'χ'=>"\\chi",'ψ'=>"\\psi",'ω'=>"\\omega",
        'Γ'=>"\\Gamma",'Δ'=>"\\Delta",'Θ'=>"\\Theta",'Λ'=>"\\Lambda",'Ξ'=>"\\Xi",'Π'=>"\\Pi",'Σ'=>"\\Sigma",'Υ'=>"\\Upsilon",'Φ'=>"\\Phi",'Ψ'=>"\\Psi",'Ω'=>"\\Omega",
        '∑'=>"\\sum",'∏'=>"\\prod",'∐'=>"\\coprod",'∫'=>"\\int",'∬'=>"\\iint",'∭'=>"\\iiint",'∮'=>"\\oint",'∞'=>"\\infty",'∂'=>"\\partial",'∇'=>"\\nabla",'√'=>"\\surd",
        '∈'=>"\\in",'∉'=>"\\notin",'∋'=>"\\ni",'⊂'=>"\\subset",'⊃'=>"\\supset",'⊆'=>"\\subseteq",'⊇'=>"\\supseteq",'⊄'=>"\\not\\subset",'⊊'=>"\\subsetneq",'⊈'=>"\\nsubseteq",'∅'=>"\\varnothing",'∪'=>"\\cup",'∩'=>"\\cap",'⋃'=>"\\bigcup",'⋂'=>"\\bigcap",'∨'=>"\\vee",'∧'=>"\\wedge",'⋁'=>"\\bigvee",'⋀'=>"\\bigwedge",'¬'=>"\\neg",'∀'=>"\\forall",'∃'=>"\\exists",'∄'=>"\\nexists",
        '≤'=>"\\leq",'≥'=>"\\geq",'≠'=>"\\neq",'≈'=>"\\approx",'≃'=>"\\simeq",'≅'=>"\\cong",'≡'=>"\\equiv",'∼'=>"\\sim",'∝'=>"\\propto",'≪'=>"\\ll",'≫'=>"\\gg",'≺'=>"\\prec",'≻'=>"\\succ",'≼'=>"\\preceq",'≽'=>"\\succeq",'⊥'=>"\\perp",'∥'=>"\\parallel",'∣'=>"\\mid",'∤'=>"\\nmid",
        '±'=>"\\pm",'∓'=>"\\mp",'×'=>"\\times",'÷'=>"\\div",'·'|'⋅'=>"\\cdot",'∘'=>"\\circ",'∗'=>"\\ast",'⊕'=>"\\oplus",'⊗'=>"\\otimes",'⊙'=>"\\odot",'⊖'=>"\\ominus",'⊘'=>"\\oslash",'⋆'=>"\\star",'∖'=>"\\setminus",'−'=>"-",
        '→'=>"\\to",'←'=>"\\leftarrow",'↔'=>"\\leftrightarrow",'⇒'=>"\\Rightarrow",'⇐'=>"\\Leftarrow",'⇔'=>"\\Leftrightarrow",'↦'=>"\\mapsto",'↪'=>"\\hookrightarrow",'↑'=>"\\uparrow",'↓'=>"\\downarrow",'↗'=>"\\nearrow",'↘'=>"\\searrow",'⟶'=>"\\longrightarrow",'⟹'=>"\\Longrightarrow",
        'ℝ'=>"\\mathbb{R}",'ℕ'=>"\\mathbb{N}",'ℤ'=>"\\mathbb{Z}",'ℚ'=>"\\mathbb{Q}",'ℂ'=>"\\mathbb{C}",'ℙ'=>"\\mathbb{P}",'ℍ'=>"\\mathbb{H}",'ℓ'=>"\\ell",'ℏ'=>"\\hbar",'ℑ'=>"\\Im",'ℜ'=>"\\Re",'ℵ'=>"\\aleph",'℘'=>"\\wp",
        '…'=>"\\ldots",'⋯'=>"\\cdots",'⋮'=>"\\vdots",'⋱'=>"\\ddots",'∴'=>"\\therefore",'∵'=>"\\because",'∠'=>"\\angle",'⊢'=>"\\vdash",'⊨'=>"\\models",'⊣'=>"\\dashv",'⊤'=>"\\top",'⌊'=>"\\lfloor",'⌋'=>"\\rfloor",'⌈'=>"\\lceil",'⌉'=>"\\rceil",'⟨'|'〈'=>"\\langle",'⟩'|'〉'=>"\\rangle",'‖'=>"\\Vert",'′'=>"\\prime",'″'=>"\\prime\\prime",'°'=>"{}^\\circ",
        _=>return None,
    })
}
fn math_text(text: &str) -> String {
    let mut out = String::new();
    for c in text.chars() {
        if let Some(symbol)=math_symbol(c) {out.push_str(symbol);out.push(' ');continue;}
        // Unicode mathematical Latin alphabets retain their semantic font.
        let code=c as u32;
        let mut styled=false;
        for (start,command) in [(0x1d400,"mathbf"),(0x1d434,"mathit"),(0x1d468,"boldsymbol"),(0x1d504,"mathfrak"),(0x1d538,"mathbb"),(0x1d5a0,"mathsf"),(0x1d670,"mathtt")] {
            if (start..start+52).contains(&code) {
                let offset=code-start; let letter=char::from_u32(if offset<26 {65+offset}else{97+offset-26}).unwrap();
                out.push_str(&format!("\\{command}{{{letter}}}"));styled=true;break;
            }
        }
        if styled {continue;}
        match c {
            '\u{2061}'|'\u{2062}'|'\u{2064}'|'\u{200b}'=>{},
            '\u{2063}'=>out.push(','),
            '\u{00a0}'|'\u{2009}'=>out.push_str("\\, "),
            '\\'=>out.push_str("\\backslash "),
            '^'=>out.push_str("\\hat{}"),
            '~'=>out.push_str("\\sim "),
            '¹'=>out.push_str("^{1}"),'²'=>out.push_str("^{2}"),'³'=>out.push_str("^{3}"),
            c if c.is_whitespace()=>{},
            _=>out.push_str(&escape_tex(&c.to_string())),
        }
    }
    out
}
fn math_warn(warnings: &mut Vec<String>, message: &str) {
    if warnings.len()<100 && !warnings.iter().any(|w| w==message) {warnings.push(message.into());}
}
fn property<'a>(node: &'a Node, properties: &str, name: &str) -> Option<&'a str> {
    node.child(properties).and_then(|p|p.child(name)).map(|p|p.attr("val"))
}
fn on(value: &str) -> bool { !matches!(value,"0"|"false"|"off") }
fn delimiter(value: &str) -> Option<&'static str> {
    Some(match value {""=>".","("=>"(",")"=>")","["=>"[","]"=>"]","{"=>"\\{","}"=>"\\}","|"=>"|","‖"|"||"=>"\\Vert", "⟨"|"〈"=>"\\langle","⟩"|"〉"=>"\\rangle","⌊"=>"\\lfloor","⌋"=>"\\rfloor","⌈"=>"\\lceil","⌉"=>"\\rceil","/"=>"/","\\"=>"\\backslash",_=>return None})
}
fn fenced(open: &str, content: &str, close: &str) -> String {
    match (delimiter(open),delimiter(close)) {
        (Some(a),Some(b))=>format!("\\left{a} {content}\\right{b}"),
        _=>format!("{}{}{}",math_text(open),content,math_text(close)),
    }
}
fn accent(symbol: &str, base: &str, under: bool) -> String {
    let cmd=match (symbol,under) {
        ("̂"|"^"|"ˆ",false)=>"hat",("̃"|"~"|"˜",false)=>"widetilde",("̄"|"¯"|"‾"|"−"|"_",false)=>"overline",
        ("̄"|"¯"|"‾"|"−"|"_"|"̲",true)=>"underline",("̇"|"˙"|".",false)=>"dot",("̈"|"¨",false)=>"ddot",("⃛",false)=>"dddot",("⃗"|"→",false)=>"vec",("←",false)=>"overleftarrow",("↔",false)=>"overleftrightarrow",("̆"|"˘",false)=>"breve",("̌"|"ˇ",false)=>"check",("̀"|"`",false)=>"grave",("́"|"´",false)=>"acute",("⏞"|"︷",false)=>"overbrace",("⏟"|"︸",true)=>"underbrace",
        _=>return if under {format!("\\underset{{{}}}{{{base}}}",math_text(symbol))}else{format!("\\overset{{{}}}{{{base}}}",math_text(symbol))},
    };format!("\\{cmd}{{{base}}}")
}
fn styled_math(text: String, style: &str) -> String {
    let command=match style {"normal"|"p"=>"mathrm","bold"|"b"=>"mathbf","italic"|"i"=>"mathit","bold-italic"|"bi"=>"boldsymbol","double-struck"=>"mathbb","script"=>"mathcal","fraktur"=>"mathfrak","sans-serif"=>"mathsf","monospace"=>"mathtt",_=>return text};
    format!("\\{command}{{{text}}}")
}
fn named_function(name: &str) -> Option<String> {
    let name=name.trim();
    if ["sin","cos","tan","cot","sec","csc","arcsin","arccos","arctan","sinh","cosh","tanh","coth","log","ln","lg","exp","lim","liminf","limsup","min","max","sup","inf","det","gcd","ker","dim","hom","arg","deg","Pr"].contains(&name) {Some(format!("\\{name} "))}else{None}
}
struct MathRenderer {warnings: Vec<String>}
impl MathRenderer {
    fn new() -> Self {Self{warnings:Vec::new()}}
    fn warn(&mut self,message: &str){math_warn(&mut self.warnings,message)}
    fn all(&mut self,n:&Node)->String {n.children.iter().map(|c|self.render(c)).collect()}
    fn part(&mut self,n:&Node,tag:&str)->String {n.child(tag).map(|c|self.render(c)).unwrap_or_else(||{self.warn("A structured equation has a missing argument; review its output.");String::new()})}
    fn render(&mut self,n:&Node)->String {
        let children:Vec<_>=n.children.iter().filter(|c|!c.tag.ends_with("Pr") && !(c.tag.is_empty()&&c.text.trim().is_empty())).collect();
        let at=|this:&mut Self,i:usize|children.get(i).map(|c|this.render(c)).unwrap_or_else(||{this.warn("A structured equation has a missing argument; review its output.");String::new()});
        match n.tag.as_str() {
            "f"|"mfrac"=>{
                let (num,den,kind)=if n.tag=="f" {(self.part(n,"num"),self.part(n,"den"),property(n,"fPr","type").unwrap_or("bar"))}else{(at(self,0),at(self,1),if n.attr("bevelled")=="true" {"skw"}else if ["0","0px","0pt"].contains(&n.attr("linethickness")){"noBar"}else{"bar"})};
                match kind {"noBar"=>format!("\\genfrac{{}}{{}}{{0pt}}{{}}{{{num}}}{{{den}}}"),"lin"|"skw"=>format!("{{{num}}}/{{{den}}}"),_=>format!("\\frac{{{num}}}{{{den}}}")}
            }
            "rad"=>{let base=self.part(n,"e");let degree=n.child("deg").map(|c|self.render(c)).unwrap_or_default();if degree.is_empty() || property(n,"radPr","degHide").is_some_and(on){format!("\\sqrt{{{base}}}")}else{format!("\\sqrt[{degree}]{{{base}}}")}}
            "msqrt"=>format!("\\sqrt{{{}}}",self.all(n)),
            "mroot"=>{let base=at(self,0);let degree=at(self,1);format!("\\sqrt[{degree}]{{{base}}}")}
            "sSub"|"msub"=>{let (base,sub)=if n.tag=="sSub"{(self.part(n,"e"),self.part(n,"sub"))}else{(at(self,0),at(self,1))};format!("{{{base}}}_{{{sub}}}")}
            "sSup"|"msup"=>{let (base,sup)=if n.tag=="sSup"{(self.part(n,"e"),self.part(n,"sup"))}else{(at(self,0),at(self,1))};format!("{{{base}}}^{{{sup}}}")}
            "sSubSup"|"msubsup"=>{let (base,sub,sup)=if n.tag=="sSubSup"{(self.part(n,"e"),self.part(n,"sub"),self.part(n,"sup"))}else{(at(self,0),at(self,1),at(self,2))};format!("{{{base}}}_{{{sub}}}^{{{sup}}}")}
            "sPre"=>{let base=self.part(n,"e");let sub=self.part(n,"sub");let sup=self.part(n,"sup");format!("{{}}_{{{sub}}}^{{{sup}}}{{{base}}}")}
            "mmultiscripts"=>{
                let base=at(self,0);let split=children.iter().position(|c|c.tag=="mprescripts").unwrap_or(children.len());let mut post=String::new();let mut pre=String::new();
                for (list,out) in [(&children[1.min(children.len())..split],&mut post),(&children[(split+1).min(children.len())..],&mut pre)] {
                    if list.len()%2!=0 {self.warn("A MathML multiscript has an unmatched subscript/superscript argument.");}
                    for pair in list.chunks(2) {let sub=self.render(pair[0]);let sup=pair.get(1).map(|n|self.render(n)).unwrap_or_default();out.push_str(&format!("{{}}_{{{sub}}}^{{{sup}}}"));}
                }
                format!("{pre}{{{base}}}{post}")
            }
            "nary"=>{
                let symbol=property(n,"naryPr","chr").unwrap_or("∫");let mut out=math_text(symbol);
                if !matches!(symbol,"∑"|"∏"|"∐"|"∫"|"∬"|"∭"|"∮"|"⋃"|"⋂"|"⋁"|"⋀") {out=format!("\\mathop{{{out}}}");}
                match property(n,"naryPr","limLoc"){Some("undOvr")=>out.push_str("\\limits"),Some("subSup")=>out.push_str("\\nolimits"),_=>{}}
                for (tag,hide,marker) in [("sub","subHide",'_'),("sup","supHide",'^')] {if !property(n,"naryPr",hide).is_some_and(on){if let Some(c)=n.child(tag){let value=self.render(c);if !value.is_empty(){out.push_str(&format!("{marker}{{{value}}}"));}}}}
                out.push(' ');out.push_str(&self.part(n,"e"));out
            }
            "limLow"|"limUpp"=>{let base=self.part(n,"e");let limit=self.part(n,"lim");format!("\\{}{{{limit}}}{{{base}}}",if n.tag=="limLow"{"underset"}else{"overset"})}
            "munder"|"mover"|"munderover"=>{
                let base=at(self,0);let is_under=n.tag!="mover";let is_over=n.tag!="munder";
                let mut out=base;
                for (enabled,index,under,attr) in [(is_under,1,true,"accentunder"),(is_over,if is_under{2}else{1},false,"accent")] {
                    if !enabled {continue;}let script=at(self,index);let symbol=children.get(index).map(|c|c.content()).unwrap_or_default();
                    let inferred=children.get(index).is_some_and(|c|c.tag=="mo") && matches!(symbol.trim(),"̂"|"^"|"ˆ"|"̃"|"~"|"˜"|"̄"|"¯"|"‾"|"_"|"̲"|"̇"|"˙"|"̈"|"¨"|"⃗"|"→"|"←"|"↔"|"⏞"|"⏟");
                    if n.attr(attr)=="true" || (n.attr(attr)!="false"&&inferred){out=accent(symbol.trim(),&out,under);}else{out=format!("\\{}{{{script}}}{{{out}}}",if under{"underset"}else{"overset"});}
                }out
            }
            "acc"|"groupChr"=>{let base=self.part(n,"e");let props=if n.tag=="acc"{"accPr"}else{"groupChrPr"};let symbol=property(n,props,"chr").unwrap_or(if n.tag=="acc"{"̂"}else{"⏟"});let under=property(n,props,"pos")==Some("bot") || (n.tag=="groupChr"&&property(n,props,"pos").is_none());accent(symbol,&base,under)}
            "bar"=>{let base=self.part(n,"e");format!("\\{}{{{base}}}",if property(n,"barPr","pos")==Some("bot"){"underline"}else{"overline"})}
            "d"|"mfenced"=>{
                let (open,close,separators,args)=if n.tag=="d" {(property(n,"dPr","begChr").unwrap_or("("),property(n,"dPr","endChr").unwrap_or(")"),property(n,"dPr","sepChr").unwrap_or("|"),children.iter().copied().filter(|c|c.tag=="e").collect::<Vec<_>>())}else{(n.attrs.get("open").map(String::as_str).unwrap_or("("),n.attrs.get("close").map(String::as_str).unwrap_or(")"),n.attrs.get("separators").map(String::as_str).unwrap_or(","),children.clone())};
                let separators:Vec<_>=separators.chars().filter(|c|!c.is_whitespace()).collect();let mut body=String::new();
                for (i,c) in args.iter().enumerate(){if i>0 {if let Some(sep)=separators.get((i-1).min(separators.len().saturating_sub(1))){body.push_str(&math_text(&sep.to_string()));body.push(' ');}}body.push_str(&self.render(c));}
                fenced(open,&body,close)
            }
            "m"|"mtable"=>{
                let mut rows=Vec::new();for row in children.iter().filter(|c|matches!(c.tag.as_str(),"mr"|"mtr"|"mlabeledtr")) {
                    if row.tag=="mlabeledtr" {self.warn("MathML equation labels are retained as a matrix column; review their placement.");}
                    rows.push(self.render(row));
                }format!("\\begin{{matrix}}{}\\end{{matrix}}",rows.join(" \\\\ "))
            }
            "mr"|"mtr"|"mlabeledtr"=>children.iter().filter(|c|c.tag=="e"||c.tag=="mtd").map(|c|self.render(c)).collect::<Vec<_>>().join(" & "),
            "eqArr"=>format!("\\begin{{gathered}}{}\\end{{gathered}}",children.iter().filter(|c|c.tag=="e").map(|c|self.render(c)).collect::<Vec<_>>().join(" \\\\ ")),
            "func"=>{let name=n.child("fName");let function=name.and_then(|n|named_function(&n.content())).unwrap_or_else(||name.map(|n|self.render(n)).unwrap_or_default());let base=self.part(n,"e");format!("{function} {base}")}
            "r"=>{
                let text=n.content();let props=n.child("rPr");
                if props.and_then(|p|p.child("nor")).is_some_and(|v|on(v.attr("val"))){return format!("\\text{{{}}}",escape_tex(&text));}
                let style=property(n,"rPr","sty").unwrap_or("");let alphabet=property(n,"rPr","scr").unwrap_or("");
                if style=="p" {if let Some(function)=named_function(&text){return function;}}
                let body=self.all(n);
                let body=match alphabet {"double-struck"|"script"|"fraktur"|"sans-serif"|"monospace"=>styled_math(body,alphabet),_=>body};
                if style=="p" && !text.chars().any(char::is_alphabetic) {body}else{styled_math(body,style)}
            }
            "mi"=>{
                let text=n.content();let variant=n.attr("mathvariant");if variant.is_empty()||variant=="normal" {if let Some(function)=named_function(&text){return function;}}
                let rendered=math_text(&text);styled_math(rendered,if variant.is_empty()&&text.chars().count()>1{"normal"}else{variant})
            }
            "mn"|"mo"|"t"=>math_text(&n.content()),
            "mtext"=>format!("\\text{{{}}}",escape_tex(&n.content())),
            "ms"=>format!("\\text{{\"{}\"}}",escape_tex(&n.content())),
            "mstyle"=>{let body=self.all(n);let body=styled_math(body,n.attr("mathvariant"));match n.attr("displaystyle"){"true"=>format!("{{\\displaystyle {body}}}"),"false"=>format!("{{\\textstyle {body}}}"),_=>body}}
            "mphantom"|"phant"=>{let body=if n.tag=="phant"{self.part(n,"e")}else{self.all(n)};if n.tag=="phant"&&property(n,"phantPr","show").is_some_and(on){body}else{format!("\\phantom{{{body}}}")}}
            "borderBox"|"menclose"=>{let body=if n.tag=="borderBox"{self.part(n,"e")}else{self.all(n)};if n.tag=="borderBox"||n.attr("notation")=="box" {format!("\\boxed{{{body}}}")}else if n.attr("notation")=="radical"{format!("\\sqrt{{{body}}}")}else{self.warn("An equation enclosure could not be reproduced exactly.");body}}
            "semantics"=>children.iter().find(|c|!matches!(c.tag.as_str(),"annotation"|"annotation-xml")).map(|c|self.render(c)).unwrap_or_else(||{self.warn("A MathML equation has only an annotation and no presentation tree; its raw TeX was not executed.");String::new()}),
            "annotation"|"annotation-xml"|"none"|"mprescripts"=>String::new(),
            "mspace"=>"\\, ".into(),
            "malignmark"|"maligngroup"=>{self.warn("Equation alignment markers were normalized; review alignment.");String::new()},
            ""=>if n.text.trim().is_empty(){String::new()}else{math_text(&n.text)},
            tag if tag.ends_with("Pr")=>String::new(),
            "math"|"oMath"|"oMathPara"|"mrow"|"e"|"num"|"den"|"sub"|"sup"|"deg"|"lim"|"fName"|"mtd"|"box"|"mpadded"=>self.all(n),
            _=>{self.warn("An unsupported equation element was flattened; review its mathematical meaning.");self.all(n)}
        }
    }
}
#[cfg(test)]
fn math(n:&Node)->String {MathRenderer::new().render(n)}
fn render_math(n:&Node,ctx:&mut Context)->String {
    let mut renderer=MathRenderer::new();let body=renderer.render(n);for warning in renderer.warnings{ctx.warn(&warning);}body
}
fn render(n: &Node, ctx: &mut Context, depth: usize) -> String {
    if depth > 128 {
        ctx.warn("Deeply nested content was omitted.");
        return String::new();
    }
    let tag = n.tag.as_str();
    if tag == "" {
        return escape_tex(&n.text);
    }
    if [
        "script",
        "style",
        "head",
        "pPr",
        "rPr",
        "sectPr",
        "tblPr",
        "trPr",
        "tcPr",
        "del",
        "instrText",
    ]
    .contains(&tag)
    {
        return String::new();
    }
    if ["oMath", "math"].contains(&tag) {
        ctx.equations += 1;
        let body = render_math(n, ctx);
        return if tag == "math" && n.attr("display") == "block" { format!("\n\\[{body}\\]\n") } else {format!("\\({body}\\)")};
    }
    if tag == "oMathPara" {
        ctx.equations += 1;
        return format!("\n\\[{}\\]\n", render_math(n, ctx));
    }
    if tag == "frame" || tag == "object" {
        let object = if tag == "object" { Some(n) } else { n.child("object") };
        if let Some(object) = object.filter(|o| !o.attr("href").is_empty()) {
            let path = normalize(&format!("{}/{}/content.xml", ctx.base, object.attr("href")));
            if let Ok(doc) = get_xml(ctx, &path) {
                if let Some(equation) = doc.find("math") {
                    ctx.equations += 1;
                    // ODF frames normally also contain a raster preview. Use the
                    // editable MathML once, without duplicating that preview.
                    let body = render_math(equation, ctx);
                    return format!("\\({body}\\)");
                }
            }
            ctx.warn("An embedded ODT object has no readable MathML; its preview may need manual reconstruction.");
        }
    }
    if tag == "blip" {
        let target = ctx.relations.get(n.attr("embed")).cloned();
        return target.map(|path| ctx.image(&path)).unwrap_or_default();
    }
    if tag == "img" || tag == "image" {
        let src = if tag == "img" {
            n.attr("src")
        } else {
            n.attr("href")
        };
        return ctx.image(src);
    }
    let mut inner = String::new();
    if !["table", "tbl"].contains(&tag) {
        let mut list = String::new();
        for c in &n.children {
            let num = c.child("pPr").and_then(|p| p.child("numPr"));
            let kind = if let Some(num) = num {
                ctx.numbering
                    .get(num.child("numId").map(|v| v.attr("val")).unwrap_or(""))
                    .map(String::as_str)
                    .unwrap_or("itemize")
            } else {
                ""
            }
            .to_owned();
            if list != kind {
                if !list.is_empty() {
                    inner.push_str(&format!("\\end{{{list}}}\n"));
                }
                if !kind.is_empty() {
                    inner.push_str(&format!("\\begin{{{kind}}}\n"));
                }
                list = kind;
            }
            inner.push_str(&render(c, ctx, depth + 1));
        }
        if !list.is_empty() {
            inner.push_str(&format!("\\end{{{list}}}\n"));
        }
    }
    match tag {
        "t" => escape_tex(&n.content()),
        "p" | "h" => {
            ctx.blocks += 1;
            let plain = n.content();
            ctx.text.push_str(plain.trim());
            ctx.text.push('\n');
            let style = n
                .child("pPr")
                .and_then(|p| p.child("pStyle"))
                .map(|s| s.attr("val"))
                .unwrap_or("");
            let style = ctx
                .styles
                .get(style)
                .map(String::as_str)
                .unwrap_or(style)
                .to_ascii_lowercase()
                .replace(' ', "");
            let level = if tag == "h" {
                n.attr("outline-level").parse::<usize>().unwrap_or(1)
            } else {
                style
                    .strip_prefix("heading")
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0)
            };
            if level > 0 || style == "title" {
                let cmd = match level {
                    0 | 1 => "section*",
                    2 => "subsection*",
                    _ => "subsubsection*",
                };
                format!("\n\\{cmd}{{{}}}\n", inner.trim())
            } else if n.child("pPr").and_then(|p| p.child("numPr")).is_some() {
                format!("\\item {}\n", inner.trim())
            } else {
                format!("\n{}\n\n", inner.trim())
            }
        }
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
            ctx.blocks += 1;
            ctx.text.push_str(&n.content());
            ctx.text.push('\n');
            format!(
                "\n\\{}{{{}}}\n",
                match tag {
                    "h1" => "section*",
                    "h2" => "subsection*",
                    _ => "subsubsection*",
                },
                inner.trim()
            )
        }
        "r" => {
            let properties = n.child("rPr");
            let mut out = inner;
            if properties
                .and_then(|p| p.child("b"))
                .is_some_and(|p| p.attr("val") != "0" && p.attr("val") != "false")
            {
                out = format!("\\textbf{{{out}}}");
            }
            if properties
                .and_then(|p| p.child("i"))
                .is_some_and(|p| p.attr("val") != "0" && p.attr("val") != "false")
            {
                out = format!("\\textit{{{out}}}");
            }
            if let Some(position) = properties.and_then(|p| p.child("vertAlign")) {
                if position.attr("val") == "superscript" {
                    out = format!("\\textsuperscript{{{out}}}")
                } else if position.attr("val") == "subscript" {
                    out = format!("\\textsubscript{{{out}}}")
                }
            }
            out
        }
        "strong" | "b" => format!("\\textbf{{{inner}}}"),
        "em" | "i" => format!("\\textit{{{inner}}}"),
        "sup" => format!("\\textsuperscript{{{inner}}}"),
        "sub" => format!("\\textsubscript{{{inner}}}"),
        "ul" | "list" => format!("\n\\begin{{itemize}}\n{inner}\\end{{itemize}}\n"),
        "ol" => format!("\n\\begin{{enumerate}}\n{inner}\\end{{enumerate}}\n"),
        "li" | "list-item" => format!("\\item {inner}\n"),
        "br" | "line-break" | "cr" => "\\newline\n".into(),
        "tab" => "\\quad ".into(),
        "table" | "tbl" => {
            let rows = table_rows(n);
            let columns = rows
                .iter()
                .map(|r| {
                    r.children
                        .iter()
                        .filter(|c| ["td", "th", "tc", "table-cell"].contains(&c.tag.as_str()))
                        .count()
                })
                .max()
                .unwrap_or(1)
                .max(1);
            if columns > 20 {
                ctx.warn("A table wider than 20 columns was flattened.");
                return n
                    .children
                    .iter()
                    .map(|c| render(c, ctx, depth + 1))
                    .collect();
            }
            if n.find("gridSpan").is_some()
                || n.find("vMerge").is_some()
                || n.find("spanned-table-cell").is_some()
                || rows.iter().any(|r| {
                    r.children
                        .iter()
                        .any(|c| !c.attr("colspan").is_empty() || !c.attr("rowspan").is_empty())
                })
            {
                ctx.warn("Merged table cells were flattened; review table alignment.");
            }
            let mut body = String::new();
            for row in rows {
                let mut cells = Vec::new();
                for cell in &row.children {
                    if ["td", "th", "tc", "table-cell"].contains(&cell.tag.as_str()) {
                        cells.push(render(cell, ctx, depth + 1));
                    }
                }
                cells.resize(columns, String::new());
                body.push_str(&cells.join(" & "));
                body.push_str(" \\\\ \\hline\n");
            }
            format!(
                "\n\\begin{{longtable}}{{{}}}\n{body}\\end{{longtable}}\n",
                format!("p{{{:.4}\\linewidth}}", 0.90 / columns as f64).repeat(columns)
            )
        }
        "blockquote" => format!("\\begin{{quote}}{inner}\\end{{quote}}"),
        "div" | "section" | "article" | "header" | "footer" | "figure" | "figcaption" => {
            format!("\n\n{inner}\n\n")
        }
        "code" | "pre" => format!("\\texttt{{{inner}}}"),
        _ => inner,
    }
}
fn table_rows(n: &Node) -> Vec<&Node> {
    let mut rows = Vec::new();
    for c in &n.children {
        if ["tr", "table-row"].contains(&c.tag.as_str()) {
            rows.push(c)
        } else if ["thead", "tbody", "tfoot", "table-header-rows"].contains(&c.tag.as_str()) {
            rows.extend(table_rows(c));
        }
    }
    rows
}

pub fn convert_document(bytes: &[u8], format: &str) -> Result<DocumentResult, String> {
    if bytes.len() > 64 * 1024 * 1024 {
        return Err("Direct conversion accepts documents up to 64 MB".into());
    }
    let format = format.trim_start_matches('.').to_ascii_lowercase();
    let mut ctx = Context {
        files: BTreeMap::new(),
        relations: BTreeMap::new(),
        styles: BTreeMap::new(),
        numbering: BTreeMap::new(),
        assets: Vec::new(),
        asset_map: BTreeMap::new(),
        base: String::new(),
        warnings: Vec::new(),
        blocks: 0,
        equations: 0,
        text: String::new(),
    };
    let body=match format.as_str(){
        "docx"=>{
            ctx.files=archive(bytes)?;ctx.base="word".into();
            if let Ok(rels)=get_xml(&ctx,"word/_rels/document.xml.rels"){for rel in &rels.children{if rel.attr("TargetMode")!="External"{ctx.relations.insert(rel.attr("Id").into(),rel.attr("Target").into());}}}
            if let Ok(styles)=get_xml(&ctx,"word/styles.xml"){for style in &styles.children{if let Some(name)=style.child("name"){ctx.styles.insert(style.attr("styleId").into(),name.attr("val").into());}}}
            if let Ok(numbering)=get_xml(&ctx,"word/numbering.xml"){
                let definitions:BTreeMap<_,_>=numbering.children.iter().filter(|n|n.tag=="abstractNum").map(|n|(n.attr("abstractNumId"),if n.find("numFmt").is_some_and(|n|n.attr("val")=="bullet"){"itemize"}else{"enumerate"})).collect();
                for num in numbering.children.iter().filter(|n|n.tag=="num"){if let Some(id)=num.child("abstractNumId"){ctx.numbering.insert(num.attr("numId").into(),definitions.get(id.attr("val")).unwrap_or(&"itemize").to_string());}}
                ctx.warn("Word list nesting, custom labels, and numbering restarts are normalized.");
            }
            let doc=get_xml(&ctx,"word/document.xml")?;
            if doc.find("drawing").is_some(){ctx.warn("Floating image positioning is normalized to inline figures.");}
            if doc.find("fldChar").is_some(){ctx.warn("Word fields use their saved display text; field logic is not reconstructed.");}
            for tag in ["footnoteReference","endnoteReference","object","vMerge","ins"]{if doc.find(tag).is_some(){ctx.warn("Footnotes, embedded objects, tracked changes, or complex table features need manual review.");}}
            let root=doc.child("body").ok_or("DOCX has no document body")?;render(root,&mut ctx,0)
        },
        "epub"=>{
            ctx.files=archive(bytes)?;
            if ctx.files.contains_key("META-INF/encryption.xml"){
                let encryption=get_xml(&ctx,"META-INF/encryption.xml")?;
                let mut methods=Vec::new();
                fn methods_in<'a>(node:&'a Node,out:&mut Vec<&'a Node>){if node.tag=="EncryptionMethod"{out.push(node);}for child in &node.children{methods_in(child,out);}}
                methods_in(&encryption,&mut methods);
                if methods.is_empty() || methods.iter().any(|n|!["http://www.idpf.org/2008/embedding","http://ns.adobe.com/pdf/enc#RC"].contains(&n.attr("Algorithm"))){return Err("Encrypted/DRM EPUB content is not supported".into());}
                ctx.warn("Obfuscated EPUB fonts are omitted; document text remains editable.");
            }
            let container=get_xml(&ctx,"META-INF/container.xml")?;
            let package=container.find("rootfile").ok_or("EPUB has no rootfile")?.attr("full-path").to_owned();
            let opf=get_xml(&ctx,&package)?;let base=package.rsplit_once('/').map(|p|p.0).unwrap_or("");
            let manifest=opf.child("manifest").ok_or("EPUB has no manifest")?;
            let items:BTreeMap<_,_>=manifest.children.iter().filter(|n|n.tag=="item").map(|n|(n.attr("id"),n.attr("href"))).collect();
            let spine=opf.child("spine").ok_or("EPUB has no spine")?;let mut out=String::new();
            for chapter in spine.children.iter().filter(|n|n.tag=="itemref"){
                let path=normalize(&format!("{base}/{}",items.get(chapter.attr("idref")).ok_or("EPUB spine item missing from manifest")?));
                let text=std::str::from_utf8(ctx.files.get(&path).ok_or_else(||format!("Missing EPUB chapter {path}"))?).map_err(|_|"EPUB chapter is not UTF-8")?.to_owned();
                ctx.base=path.rsplit_once('/').map(|p|p.0).unwrap_or("").into();
                let doc=parse_html(&text)?;out.push_str(&render(doc.find("body").unwrap_or(&doc),&mut ctx,0));
            }out
        },
        "odt"=>{ctx.files=archive(bytes)?;let doc=get_xml(&ctx,"content.xml")?;let root=doc.find("body").ok_or("ODT has no body")?;ctx.warn("ODT style definitions and non-MathML equation objects may need manual reconstruction.");render(root,&mut ctx,0)},
        "html"|"htm"|"xhtml"=>{let text=std::str::from_utf8(bytes).map_err(|_|"Use UTF-8 HTML")?;let doc=parse_html(text)?;render(doc.find("body").unwrap_or(&doc),&mut ctx,0)},
        "md"|"markdown"=>{
            let text=std::str::from_utf8(bytes).map_err(|_|"Use UTF-8 Markdown")?;
            if text.contains('$'){ctx.warn("Markdown TeX equations are treated as text; use MathML in HTML for structured equations.");}
            let parser=pulldown_cmark::Parser::new_ext(text,pulldown_cmark::Options::ENABLE_TABLES|pulldown_cmark::Options::ENABLE_STRIKETHROUGH);
            let mut html=String::new();pulldown_cmark::html::push_html(&mut html,parser);
            let doc=parse_html(&html)?;render(&doc,&mut ctx,0)
        },
        "txt"=>{let text=std::str::from_utf8(bytes).map_err(|_|"Use UTF-8 plain text")?;ctx.text=text.into();ctx.blocks=text.split("\n\n").count();escape_tex(text)},
        "doc"=>return Err("Legacy binary .doc is not supported. Save as .docx in Word first; no PDF step is needed.".into()),
        _=>return Err("Supported direct formats: DOCX, EPUB, ODT, HTML, Markdown, UTF-8 TXT. Export Google Docs as DOCX.".into()),
    };
    let tex=format!("% Direct structured conversion by GraphToTeX; no PDF intermediate.\n\\documentclass[11pt]{{article}}\n\\usepackage{{fontspec,amsmath,amssymb,graphicx,longtable}}\n\\usepackage[margin=1in]{{geometry}}\n\\setlength{{\\parindent}}{{0pt}}\n\\setlength{{\\parskip}}{{0.5em}}\n\\begin{{document}}\n{body}\n\\end{{document}}\n");
    Ok(DocumentResult {
        tex,
        text: ctx.text,
        blocks: ctx.blocks,
        equations: ctx.equations,
        warnings: ctx.warnings,
        assets: ctx.assets,
        format,
    })
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn convert_document_bytes(bytes: &[u8], format: &str) -> Result<String, String> {
    serde_json::to_string(&convert_document(bytes, format)?).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn html_structure_math_and_injection() {
        let result=convert_document(br#"<h1>Notes</h1><p>100% &amp; \input{bad}</p><ol><li>First</li></ol><math><mfrac><mi>x</mi><mn>2</mn></mfrac></math>"#,"html").unwrap();
        assert!(result.tex.contains("\\section*{Notes}"));
        assert!(result.tex.contains("\\frac{x}{2}"));
        assert!(result.tex.contains("\\textbackslash{}input\\{bad\\}"));
        assert_eq!(result.equations, 1);
    }
    #[test]
    fn math_structures() {
        let n=parse_xml("<oMath><sSubSup><e><r><t>x</t></r></e><sub><r><t>i</t></r></sub><sup><r><t>2</t></r></sup></sSubSup></oMath>").unwrap();
        assert_eq!(math(&n), "{x}_{i}^{2}");
    }
    #[test]
    fn unsupported_binary_word() {
        assert!(convert_document(b"old", "doc")
            .unwrap_err()
            .contains(".docx"));
    }
    #[test]
    fn markdown_tables() {
        let r = convert_document(b"# Hello\n\n| A | B |\n|---|---|\n| 1 | 2 |", "md").unwrap();
        assert!(r.tex.contains("longtable"));
    }
}
