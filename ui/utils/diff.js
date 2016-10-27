import DiffDOM from 'diff-dom';

const dd = new DiffDOM();

const diff = {
  applyForId($container, newHtml, newStrategy = 'prepend', idField = 'data-id') {
    const $new = $(newHtml);
    const id = $new.attr(idField);
    const $old = $container.find(`[${idField}="${id}"]`);
    if ($old.length === 0) {
      if (newStrategy === 'prepend') {
        $container.prepend($new);
        $new.trigger('vjContentNew');
      } else if (newStrategy === 'append') {
        $container.append($new);
        $new.trigger('vjContentNew');
      }
    } else {
      $old.trigger('vjContentRemove');
      dd.apply($old[0], dd.diff($old[0], $new[0]));
      $old.trigger('vjContentNew');
    }
  },
};

export default diff;
