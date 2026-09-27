const field = id => document.getElementById(id);
const valid = text => {
  if (!text.trim()) return true;
  const m = text.match(/^\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?\s*$/);
  return !!m && m[1] >= 1 && m[1] <= 12 && m[2] >= 1 && m[2] <= 31;
};
let pets = [];

window.moreApi.get().then(settings => {
  pets = settings.pets;
  field('focus').value = settings.pomodoro.focus;
  field('rest').value = settings.pomodoro.rest;
  field('diaryTime').value = settings.diaryTime;
  field('nickname').value = settings.nickname;
  field('diaryWriter').replaceChildren(...settings.pets.map(name => new Option(name, name)));
  field('diaryWriter').value = settings.diaryWriter;
  for (const name of pets) {
    const row = document.createElement('label');
    row.className = 'birthday';
    const span = document.createElement('span');
    span.textContent = name;
    const input = document.createElement('input');
    input.dataset.pet = name;
    input.placeholder = '比如 3-14';
    input.value = settings.birthdays[name] || '';
    row.append(span, input);
    field('birthdays').append(row);
  }
});

field('cancel').addEventListener('click', () => window.moreApi.cancel());

field('form').addEventListener('submit', event => {
  event.preventDefault();
  const birthdays = {};
  for (const input of document.querySelectorAll('[data-pet]')) {
    if (!valid(input.value)) { field('error').textContent = `${input.dataset.pet} 的生日写得不太对，比如 3-14`; return; }
    birthdays[input.dataset.pet] = input.value.trim();
  }
  window.moreApi.save({
    birthdays,
    pomodoro: { focus: Number(field('focus').value), rest: Number(field('rest').value) },
    diaryTime: field('diaryTime').value,
    nickname: field('nickname').value.trim(),
    diaryWriter: field('diaryWriter').value,
  });
});
