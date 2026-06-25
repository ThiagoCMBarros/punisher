const db = require('./src/config/db');

const dinoBps = {
  'giganotosaurus': '/Game/PrimalEarth/Dinos/Giganotosaurus/BionicGigant_Character_BP.BionicGigant_Character_BP',
  'carcharodontosaurus': '/Game/PrimalEarth/Dinos/Carcharodontosaurus/Carcha_Character_BP.Carcha_Character_BP',
  'stegosaurus': '/Game/PrimalEarth/Dinos/Stegosaurus/Stego_Character_BP.Stego_Character_BP',
  'triceratops': '/Game/PrimalEarth/Dinos/Triceratops/Trike_Character_BP.Trike_Character_BP',
  'carbonemys': '/Game/PrimalEarth/Dinos/Turtle/Turtle_Character_BP.Turtle_Character_BP',
  'brontosaurus': '/Game/PrimalEarth/Dinos/Sauropod/Sauropod_Character_BP.Sauropod_Character_BP',
  'rex': '/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP',
  'yutyrannus': '/Game/PrimalEarth/Dinos/Yutyrannus/Yutyrannus_Character_BP.Yutyrannus_Character_BP',
  'therizinosaurus': '/Game/PrimalEarth/Dinos/Therizino/Therizino_Character_BP.Therizino_Character_BP',
  'daeodon': '/Game/PrimalEarth/Dinos/Daeodon/Daeodon_Character_BP.Daeodon_Character_BP',
  'ankylosaurus': '/Game/PrimalEarth/Dinos/Ankylo/Ankylo_Character_BP.Ankylo_Character_BP',
  'doedicurus': '/Game/PrimalEarth/Dinos/Doedicurus/Doedic_Character_BP.Doedic_Character_BP',
  'arthropluera': '/Game/PrimalEarth/Dinos/Arthropluera/Arthro_Character_BP.Arthro_Character_BP',
  'castoroides': '/Game/PrimalEarth/Dinos/Beaver/Beaver_Character_BP.Beaver_Character_BP',
  'argentavis': '/Game/PrimalEarth/Dinos/Argentavis/Argent_Character_BP.Argent_Character_BP',
  'rhyniognatha': '/Game/PrimalEarth/Dinos/Rhyniognatha/Rhynio_Character_BP.Rhynio_Character_BP',
  'desmodus': '/Game/PrimalEarth/Dinos/Desmodus/Desmodus_Character_BP.Desmodus_Character_BP',
  'shadowmane': '/Game/PrimalEarth/Dinos/LionfishLion/LionfishLion_Character_BP.LionfishLion_Character_BP',
  'maewing': '/Game/PrimalEarth/Dinos/MilkGlider/MilkGlider_Character_BP.MilkGlider_Character_BP'
};

async function main() {
  try {
    const res = await db.query(`
      SELECT pv.id, pv.nome as variation_name, pv.level, p.slug as product_slug 
      FROM produto_variacoes pv
      JOIN produtos p ON pv.produto_id = p.id
    `);

    console.log(`Verificando e atualizando comandos para ${res.rows.length} variações de produtos...`);

    let updatedCount = 0;

    for (const row of res.rows) {
      const { id, variation_name, level, product_slug } = row;
      const bp = dinoBps[product_slug];

      if (bp) {
        let command = '';
        const nameLower = variation_name.toLowerCase();
        const dinoLevel = level || 225; // default level fallback

        if (nameLower.includes('casal')) {
          // Casal: 1 fêmea e 1 macho
          const cmdFemale = `scriptcommand asabot spawndino {ARK_ID} '${bp}' gender=female level=${dinoLevel}`;
          const cmdMale = `scriptcommand asabot spawndino {ARK_ID} '${bp}' gender=male level=${dinoLevel}`;
          command = `${cmdFemale} && ${cmdMale}`;
        } else {
          let gender = 'male'; // default
          if (nameLower.includes('fêmea') || nameLower.includes('femea')) {
            gender = 'female';
          }
          command = `scriptcommand asabot spawndino {ARK_ID} '${bp}' gender=${gender} level=${dinoLevel}`;
        }

        await db.query(
          'UPDATE produto_variacoes SET comando_rcon = $1 WHERE id = $2',
          [command, id]
        );
        console.log(`[ATUALIZADO] ${variation_name} -> "${command}"`);
        updatedCount++;
      }
    }

    console.log(`\nSucesso! ${updatedCount} comandos de dinossauros foram atualizados no banco de dados.`);
    process.exit(0);
  } catch (err) {
    console.error('Erro na migração:', err);
    process.exit(1);
  }
}

main();
