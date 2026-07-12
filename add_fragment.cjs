const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const target1 = `  return (
    <div className="min-h-screen`;
const replace1 = `  return (
    <>
    <div className="min-h-screen`;

content = content.replace(target1, replace1);

const target2 = `        })}
      </div>
    </div>
  );
}`;
const replace2 = `        })}
      </div>
    </div>
    </>
  );
}`;

content = content.replace(target2, replace2);
fs.writeFileSync('src/App.tsx', content);
